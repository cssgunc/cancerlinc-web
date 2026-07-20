/**
 * One-off migration: move patient docs to the new status scheme and backfill
 * the notification signal fields the bell + Cloud Functions rely on.
 *
 *   active     -> active
 *   follow-up  -> active
 *   pending    -> closed
 *   (missing)  -> closed
 *
 * For each patient it also reads chats/{patientId} and its newest message to set:
 *   awaitingReply        (last message sender === patient)
 *   lastContactTimestamp (newest message timestamp)
 *   lastMessageText      (newest message summary)
 *
 * Usage:
 *   node scripts/migrate-status.mjs [--dry-run]
 *
 * Prerequisites:
 *   scripts/service-account.json must exist (Firebase Console -> Project Settings
 *   -> Service Accounts -> Generate New Private Key)
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(__dirname, "service-account.json");

let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
} catch {
    console.error(
        "\n  ✗ Could not read service-account.json\n" +
            "    Download it from Firebase Console → Project Settings → Service Accounts\n" +
            `    and save it to: ${serviceAccountPath}\n`
    );
    process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

const STATUS_MAP = {
    active: "active",
    "follow-up": "active",
    pending: "closed",
};
const VALID = new Set(["urgent", "active", "inactive", "closed"]);

const IMAGE_ONLY_SUMMARY = "Sent a photo";
const IMAGE_WITH_TEXT_SUFFIX = " (photo attached)";

function summarize(content, messageType) {
    const text = content ?? "";
    if (messageType === "image") {
        return text ? `${text}${IMAGE_WITH_TEXT_SUFFIX}` : IMAGE_ONLY_SUMMARY;
    }
    return text;
}

function mapStatus(current) {
    if (VALID.has(current)) return current; // already migrated
    return STATUS_MAP[current] ?? "closed";
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function newestMessage(patientId) {
    const snap = await db
        .collection("chats")
        .doc(patientId)
        .collection("messages")
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();
    return snap.empty ? null : snap.docs[0].data();
}

async function main() {
    console.log(
        `\n  Migrating patient statuses${dryRun ? " (dry run)" : ""}...\n`
    );

    const patients = await db
        .collection("users")
        .where("role", "==", "patient")
        .get();

    console.log(`  Found ${patients.size} patient(s).\n`);

    let migrated = 0;

    for (const doc of patients.docs) {
        const data = doc.data();
        const nextStatus = mapStatus(data.status);

        const latest = await newestMessage(doc.id);
        const update = { status: nextStatus };

        if (latest) {
            update.awaitingReply = latest.senderId === doc.id;
            update.lastMessageText = summarize(
                latest.content,
                latest.messageType
            );
            if (latest.timestamp) {
                update.lastContactTimestamp = latest.timestamp;
            }
        } else {
            update.awaitingReply = false;
        }

        console.log(
            `  ${doc.id}: ${data.status ?? "(none)"} -> ${nextStatus}` +
                ` | awaitingReply=${update.awaitingReply}`
        );

        if (!dryRun) {
            await doc.ref.set(update, { merge: true });
        }
        migrated += 1;
    }

    console.log(
        `\n  ✓ ${dryRun ? "Would migrate" : "Migrated"} ${migrated} patient(s).\n`
    );
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
