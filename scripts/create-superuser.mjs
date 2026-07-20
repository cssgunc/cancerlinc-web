/**
 * One-off: create (or reset) the superuser test account in the live project.
 *   node scripts/create-superuser.mjs
 * Uses scripts/service-account.json. Idempotent: sets a known password and
 * ensures a matching staff users/{uid} doc so the account can log in and reach /staff.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
    readFileSync(resolve(__dirname, "service-account.json"), "utf8")
);

const EMAIL = "cssgunc@gmail.com";
const PASSWORD = "CancerLINC!Super2026";
const FIRST = "CSSG";
const LAST = "Superuser";
const DISPLAY = "CSSG Superuser";

initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db = getFirestore();

let uid;
try {
    const existing = await auth.getUserByEmail(EMAIL);
    uid = existing.uid;
    await auth.updateUser(uid, {
        password: PASSWORD,
        emailVerified: true,
        disabled: false,
        displayName: DISPLAY,
    });
    console.log(`Updated existing auth user ${uid}`);
} catch {
    const created = await auth.createUser({
        email: EMAIL,
        password: PASSWORD,
        emailVerified: true,
        displayName: DISPLAY,
    });
    uid = created.uid;
    console.log(`Created auth user ${uid}`);
}

await db.doc(`users/${uid}`).set(
    {
        uid,
        email: EMAIL,
        firstName: FIRST,
        lastName: LAST,
        displayName: DISPLAY,
        role: "social_worker",
        isVerified: true,
        isBanned: false,
        disabled: false,
        hospital: "",
        phoneNumber: "",
        profilePhotoUrl: "",
        createdAt: Timestamp.now(),
    },
    { merge: true }
);
console.log(`Ensured users/${uid} doc (role: social_worker)`);
console.log(`\nLogin: ${EMAIL} / ${PASSWORD}`);
process.exit(0);
