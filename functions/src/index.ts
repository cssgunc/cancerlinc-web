import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomBytes } from "crypto";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
    onCall,
    HttpsError,
    type CallableRequest,
} from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";

initializeApp();
const db = getFirestore();

// ---------------------------------------------------------------------------
// Config params
// ---------------------------------------------------------------------------

/**
 * The email address of the superuser allowed to call staff-provisioning
 * functions. Set this in `functions/.env` (local) or via the Firebase console
 * (production). Example: SUPERUSER_EMAIL=admin@cancerlinc.org
 */
const SUPERUSER_EMAIL = defineString("SUPERUSER_EMAIL");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_BATCH_SIZE = 400;

const IMAGE_ONLY_SUMMARY = "Sent a photo";
const IMAGE_WITH_TEXT_SUFFIX = " (photo attached)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMessageSummary(
    content: string,
    messageType: string | undefined
): string {
    if (messageType === "image") {
        return content
            ? `${content}${IMAGE_WITH_TEXT_SUFFIX}`
            : IMAGE_ONLY_SUMMARY;
    }
    return content;
}

/**
 * Throws HttpsError("permission-denied") unless the caller's email matches the
 * configured SUPERUSER_EMAIL param (case-insensitive).
 */
function assertSuperuser(request: CallableRequest): void {
    const callerEmail = request.auth?.token?.email?.toLowerCase() ?? "";
    if (!callerEmail || callerEmail !== SUPERUSER_EMAIL.value().toLowerCase()) {
        throw new HttpsError(
            "permission-denied",
            "Caller is not authorized to perform this action."
        );
    }
}

/** Returns a cryptographically random throwaway password (never shared with the user). */
function generateThrowawayPassword(): string {
    // 32 random bytes → 43-char base64url string; exceeds typical password-strength requirements.
    return randomBytes(32).toString("base64url");
}

// ---------------------------------------------------------------------------
// Existing triggers
// ---------------------------------------------------------------------------

/**
 * New patient docs start "closed" (status only set if the doc is a patient and
 * has no status yet). Patients are created from mobile; web signup makes staff.
 */
export const onUserCreated = onDocumentCreated(
    "users/{userId}",
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data();
        if (data.role !== "patient" || data.status) return;

        await snapshot.ref.update({
            status: "closed",
            awaitingReply: false,
        });
    }
);

/**
 * Every new message reactivates the conversation (unless it's Urgent) and
 * maintains the denormalized signal the notification bell reads off the patient
 * doc: awaitingReply, lastMessageText, lastContactTimestamp.
 */
export const onMessageCreated = onDocumentCreated(
    "chats/{chatId}/messages/{messageId}",
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const chatId = event.params.chatId;
        const message = snapshot.data();
        const senderId: string = message.senderId ?? "";
        const content: string = message.content ?? "";
        const messageType: string | undefined = message.messageType;

        // The patient is the chat owner: chatId === patient uid.
        const awaitingReply = senderId === chatId;
        const lastMessageText = buildMessageSummary(content, messageType);
        const patientRef = db.doc(`users/${chatId}`);

        await db.runTransaction(async (tx) => {
            const patientSnap = await tx.get(patientRef);
            if (!patientSnap.exists) return;

            const currentStatus = patientSnap.get("status");
            const nextStatus = currentStatus === "urgent" ? "urgent" : "active";

            tx.set(
                patientRef,
                {
                    status: nextStatus,
                    awaitingReply,
                    lastMessageText,
                    lastContactTimestamp: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        });
    }
);

/**
 * Daily sweep: patients that have been "active" with no message for 7+ days
 * become "inactive". Urgent and closed are left untouched.
 */
export const deactivateStaleChats = onSchedule("every 24 hours", async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - INACTIVITY_MS);

    const staleQuery = db
        .collection("users")
        .where("role", "==", "patient")
        .where("status", "==", "active")
        .where("lastContactTimestamp", "<=", cutoff);

    const snapshot = await staleQuery.get();
    if (snapshot.empty) {
        logger.info("deactivateStaleChats: no stale patients");
        return;
    }

    let updated = 0;
    for (let i = 0; i < snapshot.docs.length; i += STALE_BATCH_SIZE) {
        const batch = db.batch();
        for (const doc of snapshot.docs.slice(i, i + STALE_BATCH_SIZE)) {
            batch.update(doc.ref, { status: "inactive" });
            updated += 1;
        }
        await batch.commit();
    }

    logger.info(`deactivateStaleChats: set ${updated} patient(s) to inactive`);
});

// ---------------------------------------------------------------------------
// TICKET 2 — Superuser staff-provisioning callables
// ---------------------------------------------------------------------------

/**
 * createStaffAccount — provision a new social-worker account.
 *
 * Only callable by the superuser (SUPERUSER_EMAIL param).
 *
 * Input: { email, firstName, lastName, displayName?, hospital? }
 * Output: { uid, emailEnqueued }
 *
 * Steps:
 *   1. Validates inputs.
 *   2. Creates the Firebase Auth user (emailVerified=true, throwaway password).
 *   3. Writes the users/{uid} doc.
 *   4. Enqueues the invite email via the Trigger Email extension (mail collection).
 */
export const createStaffAccount = onCall(async (request) => {
    assertSuperuser(request);

    // ---- Input validation --------------------------------------------------
    const data = request.data as Record<string, unknown>;
    const { email, firstName, lastName, displayName, hospital } = data;

    if (
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
        throw new HttpsError(
            "invalid-argument",
            "A valid email address is required."
        );
    }
    if (typeof firstName !== "string" || !firstName.trim()) {
        throw new HttpsError("invalid-argument", "firstName is required.");
    }
    if (typeof lastName !== "string" || !lastName.trim()) {
        throw new HttpsError("invalid-argument", "lastName is required.");
    }
    if (displayName !== undefined && typeof displayName !== "string") {
        throw new HttpsError(
            "invalid-argument",
            "displayName must be a string when provided."
        );
    }
    if (hospital !== undefined && typeof hospital !== "string") {
        throw new HttpsError(
            "invalid-argument",
            "hospital must be a string when provided."
        );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    const cleanDisplay =
        typeof displayName === "string" && displayName.trim()
            ? displayName.trim()
            : `${cleanFirst} ${cleanLast}`;
    const cleanHospital = typeof hospital === "string" ? hospital.trim() : "";

    // ---- Create Auth user --------------------------------------------------
    let uid: string;
    try {
        const userRecord = await getAuth().createUser({
            email: cleanEmail,
            emailVerified: true,
            displayName: cleanDisplay,
            password: generateThrowawayPassword(),
        });
        uid = userRecord.uid;
    } catch (err: unknown) {
        const firebaseCode = (err as { code?: string }).code;
        if (firebaseCode === "auth/email-already-exists") {
            throw new HttpsError(
                "already-exists",
                `An account with email ${cleanEmail} already exists.`
            );
        }
        throw err;
    }

    // ---- Write users/{uid} doc ---------------------------------------------
    await db.doc(`users/${uid}`).set({
        uid,
        email: cleanEmail,
        firstName: cleanFirst,
        lastName: cleanLast,
        displayName: cleanDisplay,
        role: "social_worker",
        isVerified: true,
        isBanned: false,
        disabled: false,
        hospital: cleanHospital,
        phoneNumber: "",
        profilePhotoUrl: "",
        createdAt: Timestamp.now(),
    });

    // ---- TICKET 3: Enqueue invite email ------------------------------------
    let emailEnqueued = true;
    try {
        const link = await getAuth().generatePasswordResetLink(cleanEmail);

        await db.collection("mail").add({
            to: [cleanEmail],
            message: {
                subject: "Welcome to CancerLINC — set your password",
                text: [
                    `Hi ${cleanFirst},`,
                    "",
                    "Welcome to CancerLINC! Your staff account has been created and you are ready to get started.",
                    "",
                    "Please set your password by visiting the link below:",
                    link,
                    "",
                    "This link expires in 1 hour. If it has expired, contact your CancerLINC administrator to request a new one.",
                    "",
                    "IMPORTANT — please take this step now to avoid missing future messages:",
                    "Mark this sender address as 'Not Junk' (or 'Not Spam') and add it to your safe-senders list.",
                    "CancerLINC sends patient message notifications and status alerts from this address.",
                    "If it ends up in your spam folder you may miss time-sensitive communications.",
                    "",
                    "If you did not expect this email, please disregard it. No action is required.",
                    "",
                    "— The CancerLINC Team",
                ].join("\n"),
                html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to CancerLINC</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:#1a3c5e;padding:28px 40px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">CancerLINC</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1a3c5e;font-size:20px;font-weight:700;">
                Welcome, ${cleanFirst}!
              </h2>
              <p style="margin:0 0 16px;color:#333333;line-height:1.7;font-size:15px;">
                Your CancerLINC staff account has been created. You can now set your password and begin supporting patients.
              </p>
              <p style="margin:0 0 24px;color:#333333;line-height:1.7;font-size:15px;">
                Click the button below to set your password:
              </p>

              <!-- CTA button -->
              <p style="text-align:center;margin:0 0 28px;">
                <a href="${link}"
                   style="display:inline-block;background:#1a3c5e;color:#ffffff;text-decoration:none;
                          padding:14px 36px;border-radius:6px;font-size:16px;font-weight:600;">
                  Set My Password
                </a>
              </p>

              <!-- Fallback link -->
              <p style="margin:0 0 8px;color:#555555;font-size:13px;line-height:1.6;">
                Or copy and paste this URL into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-all;">
                <a href="${link}" style="color:#1a3c5e;">${link}</a>
              </p>
              <p style="margin:0 0 28px;color:#777777;font-size:13px;">
                This link expires in 1&nbsp;hour. Contact your administrator if you need a new one.
              </p>

              <!-- Safe-sender notice -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#fff8e1;border-left:4px solid #f59e0b;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#78350f;font-size:14px;line-height:1.7;">
                      <strong>Action required &mdash; avoid missing patient messages:</strong><br />
                      Please mark this sender as <strong>&ldquo;Not Junk&rdquo;</strong> or
                      <strong>&ldquo;Not Spam&rdquo;</strong> and add it to your
                      <strong>safe-senders&nbsp;/&nbsp;trusted-contacts list</strong> right now.
                      CancerLINC sends patient message notifications and status alerts from this
                      address. If future emails land in your spam folder you may miss
                      time-sensitive communications.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#aaaaaa;font-size:13px;line-height:1.6;">
                If you did not expect this email, please disregard it. No action is required.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f4;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#aaaaaa;font-size:12px;">
                &copy; ${new Date().getFullYear()} CancerLINC. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
            },
        });
    } catch (err: unknown) {
        emailEnqueued = false;
        logger.error("createStaffAccount: failed to enqueue invite email", {
            uid,
            email: cleanEmail,
            err,
        });
    }

    return { uid, emailEnqueued };
});

/**
 * setStaffDisabled — enable or disable a staff account.
 *
 * Mirrors the `disabled` flag to both Firebase Auth and the users/{uid} doc
 * so the web UI can read status without an Auth SDK call.
 *
 * Only callable by the superuser.
 * Input: { uid: string, disabled: boolean }
 */
export const setStaffDisabled = onCall(async (request) => {
    assertSuperuser(request);

    const data = request.data as Record<string, unknown>;
    const { uid, disabled } = data;

    if (typeof uid !== "string" || !uid.trim()) {
        throw new HttpsError("invalid-argument", "uid is required.");
    }
    if (typeof disabled !== "boolean") {
        throw new HttpsError("invalid-argument", "disabled must be a boolean.");
    }

    try {
        await getAuth().updateUser(uid, { disabled });
    } catch (err: unknown) {
        const firebaseCode = (err as { code?: string }).code;
        if (firebaseCode === "auth/user-not-found") {
            throw new HttpsError(
                "not-found",
                "No auth account found for this user."
            );
        }
        throw err;
    }
    await db.doc(`users/${uid}`).update({ disabled });

    return { success: true };
});

/**
 * deleteStaffAccount — permanently remove a staff account.
 *
 * Deletes the Firebase Auth record then the Firestore users/{uid} doc.
 * Only callable by the superuser.
 * Input: { uid: string }
 */
export const deleteStaffAccount = onCall(async (request) => {
    assertSuperuser(request);

    const data = request.data as Record<string, unknown>;
    const { uid } = data;

    if (typeof uid !== "string" || !uid.trim()) {
        throw new HttpsError("invalid-argument", "uid is required.");
    }

    try {
        await getAuth().deleteUser(uid);
    } catch (err: unknown) {
        const firebaseCode = (err as { code?: string }).code;
        if (firebaseCode !== "auth/user-not-found") {
            throw err;
        }
    }
    await db.doc(`users/${uid}`).delete();

    return { success: true };
});
