/**
 * Seed script — populates Firestore with fake patient + social worker data for testing.
 *
 * Prerequisites:
 *   1. Download a service account key from Firebase Console:
 *      Project Settings → Service Accounts → Generate New Private Key
 *   2. Save it as /workspace/scripts/service-account.json  (already gitignored below)
 *   3. Run:  node scripts/seed-patients.mjs
 *
 * Options (edit the CONFIG block below):
 *   - PATIENT_COUNT   how many patients to create
 *   - WORKER_COUNT    how many social workers to create (patients are distributed among them)
 *   - CLEAR_FIRST     if true, deletes all existing users with role=patient/social_worker first
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PATIENT_COUNT = 120;
const WORKER_COUNT = 6;
const CLEAR_FIRST = false;
// ─────────────────────────────────────────────────────────────────────────────

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

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Fake data pools ──────────────────────────────────────────────────────────
const FIRST_NAMES = [
    "James",
    "Mary",
    "John",
    "Patricia",
    "Robert",
    "Jennifer",
    "Michael",
    "Linda",
    "William",
    "Barbara",
    "David",
    "Susan",
    "Richard",
    "Jessica",
    "Joseph",
    "Sarah",
    "Thomas",
    "Karen",
    "Charles",
    "Lisa",
    "Christopher",
    "Nancy",
    "Daniel",
    "Betty",
    "Matthew",
    "Margaret",
    "Anthony",
    "Sandra",
    "Donald",
    "Ashley",
    "Mark",
    "Dorothy",
    "Paul",
    "Kimberly",
    "Steven",
    "Emily",
    "Andrew",
    "Donna",
    "Kenneth",
    "Michelle",
    "Joshua",
    "Carol",
    "Kevin",
    "Amanda",
    "Brian",
    "Melissa",
    "George",
    "Deborah",
    "Edward",
    "Stephanie",
    "Ronald",
    "Rebecca",
    "Timothy",
    "Sharon",
    "Jason",
    "Laura",
    "Jeffrey",
    "Cynthia",
    "Ryan",
    "Kathleen",
    "Jacob",
    "Amy",
    "Gary",
    "Angela",
    "Nicholas",
    "Shirley",
    "Eric",
    "Anna",
    "Jonathan",
    "Brenda",
    "Stephen",
    "Pamela",
    "Larry",
    "Emma",
    "Justin",
    "Nicole",
    "Scott",
    "Helen",
    "Brandon",
    "Samantha",
];

const LAST_NAMES = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Rodriguez",
    "Martinez",
    "Hernandez",
    "Lopez",
    "Gonzalez",
    "Wilson",
    "Anderson",
    "Thomas",
    "Taylor",
    "Moore",
    "Jackson",
    "Martin",
    "Lee",
    "Perez",
    "Thompson",
    "White",
    "Harris",
    "Sanchez",
    "Clark",
    "Ramirez",
    "Lewis",
    "Robinson",
    "Walker",
    "Young",
    "Allen",
    "King",
    "Wright",
    "Scott",
    "Torres",
    "Nguyen",
    "Hill",
    "Flores",
    "Green",
    "Adams",
    "Nelson",
    "Baker",
    "Hall",
    "Rivera",
    "Campbell",
    "Mitchell",
    "Carter",
    "Roberts",
    "Gomez",
    "Phillips",
    "Evans",
    "Turner",
    "Diaz",
    "Parker",
    "Cruz",
    "Edwards",
    "Collins",
    "Reyes",
    "Stewart",
    "Morris",
    "Morales",
    "Murphy",
];

const WORKER_FIRST = [
    "Emily",
    "Jake",
    "Sarah",
    "Marcus",
    "Diane",
    "Carlos",
    "Priya",
    "Leah",
];
const WORKER_LAST = [
    "Chen",
    "Morrison",
    "Thompson",
    "Webb",
    "Okafor",
    "Rivera",
    "Patel",
    "Nguyen",
];

const STATUSES = [
    "active",
    "active",
    "active",
    "follow-up",
    "follow-up",
    "pending",
];

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysAgoMin, daysAgoMax) {
    const msAgo =
        (Math.random() * (daysAgoMax - daysAgoMin) + daysAgoMin) * 86_400_000;
    return new Date(Date.now() - msAgo);
}

function uid() {
    return (
        Math.random().toString(36).slice(2, 10) +
        Math.random().toString(36).slice(2, 10)
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    // Optionally clear existing test users
    if (CLEAR_FIRST) {
        console.log("Clearing existing patients and social workers...");
        const snap = await db
            .collection("users")
            .where("role", "in", ["patient", "social_worker"])
            .get();
        const batchSize = 400;
        for (let i = 0; i < snap.docs.length; i += batchSize) {
            const batch = db.batch();
            snap.docs
                .slice(i, i + batchSize)
                .forEach((d) => batch.delete(d.ref));
            await batch.commit();
        }
        console.log(`  Deleted ${snap.docs.length} documents.`);
    }

    // Create social workers
    console.log(`Creating ${WORKER_COUNT} social workers...`);
    const workers = [];
    for (let i = 0; i < WORKER_COUNT; i++) {
        const firstName = WORKER_FIRST[i % WORKER_FIRST.length];
        const lastName = WORKER_LAST[i % WORKER_LAST.length];
        const id = uid();
        workers.push({
            id,
            firstName,
            lastName,
            fullName: `${firstName} ${lastName}`,
        });
    }

    const workerBatch = db.batch();
    for (const w of workers) {
        workerBatch.set(db.collection("users").doc(w.id), {
            uid: w.id,
            email: `${w.firstName.toLowerCase()}.${w.lastName.toLowerCase()}@cancerlinc-test.com`,
            firstName: w.firstName,
            lastName: w.lastName,
            lastNameLower: w.lastName.toLowerCase(),
            role: "social_worker",
            isVerified: true,
            phoneNumber: "",
            hospital: "Test Medical Center",
            profilePhotoUrl: "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
    }
    await workerBatch.commit();
    console.log(`  Created ${workers.length} social workers.`);

    // Create patients in batches of 400 (Firestore batch limit)
    console.log(`Creating ${PATIENT_COUNT} patients...`);
    const batchSize = 400;
    let created = 0;

    for (let i = 0; i < PATIENT_COUNT; i += batchSize) {
        const batch = db.batch();
        const count = Math.min(batchSize, PATIENT_COUNT - i);

        for (let j = 0; j < count; j++) {
            const firstName = pick(FIRST_NAMES);
            const lastName = pick(LAST_NAMES);
            const worker = pick(workers);
            const status = pick(STATUSES);
            const lastContact = randomDate(1, 60); // 1–60 days ago
            const id = uid();

            batch.set(db.collection("users").doc(id), {
                uid: id,
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${id.slice(0, 4)}@cancerlinc-test.com`,
                firstName,
                lastName,
                lastNameLower: lastName.toLowerCase(),
                role: "patient",
                isVerified: false,
                phoneNumber: "",
                hospital: "",
                profilePhotoUrl: "",
                status,
                assignedSocialWorkerId: worker.id,
                assignedSocialWorkerName: worker.fullName,
                lastContactTimestamp: Timestamp.fromDate(lastContact),
                createdAt: Timestamp.fromDate(randomDate(60, 365)),
                updatedAt: Timestamp.now(),
            });
        }

        await batch.commit();
        created += count;
        console.log(`  ${created} / ${PATIENT_COUNT}`);
    }

    console.log(
        `\n✓ Done. Created ${workers.length} social workers and ${created} patients.`
    );
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
