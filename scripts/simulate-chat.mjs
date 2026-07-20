/**
 * Simulate a patient sending messages into a chat conversation.
 *
 * Usage:
 *   node scripts/simulate-chat.mjs <patientId> [options]
 *
 * Options:
 *   --delay <ms>     Milliseconds between messages (default: 2000)
 *   --count <n>      Number of messages to send (default: 5)
 *   --name <name>    Sender name to display (default: "Test Patient")
 *
 * Example:
 *   node scripts/simulate-chat.mjs abc123uid --delay 3000 --count 8
 *
 * Prerequisites:
 *   scripts/service-account.json must exist (Firebase Console → Project Settings
 *   → Service Accounts → Generate New Private Key)
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

// ─── Parse CLI args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const patientId = args[0];

if (!patientId || patientId.startsWith("--")) {
    console.error(
        '\n  Usage: node scripts/simulate-chat.mjs <patientId> [--delay ms] [--count n] [--name "Patient Name"]\n'
    );
    process.exit(1);
}

function getArg(flag, defaultValue) {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const delayMs = parseInt(getArg("--delay", "2000"), 10);
const messageCount = parseInt(getArg("--count", "5"), 10);
const senderName = getArg("--name", "Test Patient");

// ─── Sample messages pool ─────────────────────────────────────────────────────

const MESSAGE_POOL = [
    "Hi, I had a question about my last appointment.",
    "When should I schedule my next follow-up?",
    "I've been feeling a bit more tired than usual lately.",
    "Is it normal to experience these side effects?",
    "Thank you for getting back to me so quickly!",
    "I picked up my prescription yesterday.",
    "My family has some questions about the treatment plan.",
    "Can you recommend any support groups in my area?",
    "I've been keeping a journal of my symptoms like you suggested.",
    "The medication seems to be helping. I feel a bit better.",
    "I had trouble sleeping last night. Is there anything I can take?",
    "Should I avoid any foods while on this medication?",
    "My next scan is scheduled for next week.",
    "I wanted to update you — the pain has decreased significantly.",
    "Is there a number I can call after hours if something comes up?",
];

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomUid() {
    return (
        Math.random().toString(36).slice(2, 10) +
        Math.random().toString(36).slice(2, 10)
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function sendMessage(chatId, senderId, text, clientBatchId, clientOrder) {
    const chatRef = db.collection("chats").doc(chatId);
    const messageRef = chatRef.collection("messages").doc();

    const batch = db.batch();

    batch.set(messageRef, {
        messageId: messageRef.id,
        senderId,
        senderName,
        content: text,
        messageType: "text",
        clientBatchId,
        clientOrder,
        timestamp: FieldValue.serverTimestamp(),
        isRead: false,
    });

    batch.set(
        chatRef,
        {
            chatId,
            participants: FieldValue.arrayUnion(senderId, chatId),
            lastMessage: text,
            lastMessageTimestamp: FieldValue.serverTimestamp(),
            lastMessageBatchId: clientBatchId,
        },
        { merge: true }
    );

    await batch.commit();
    return messageRef.id;
}

async function main() {
    console.log(`\n  Simulating ${messageCount} patient messages`);
    console.log(`  Patient (sender) ID : ${patientId}`);
    console.log(`  Chat ID             : ${patientId}  (same as patient UID)`);
    console.log(`  Sender name         : ${senderName}`);
    console.log(`  Delay between msgs  : ${delayMs}ms`);
    console.log(`\n  Open the web app to the member page for this patient,`);
    console.log(`  then watch messages arrive in real time.\n`);

    // Verify the patient exists
    const userSnap = await db.collection("users").doc(patientId).get();
    if (!userSnap.exists) {
        console.error(`  ✗ No user found with ID: ${patientId}`);
        console.error(
            `    Make sure you're using a real patient UID from Firestore.\n`
        );
        process.exit(1);
    }

    const userData = userSnap.data();
    console.log(
        `  ✓ Found patient: ${userData.firstName ?? ""} ${userData.lastName ?? ""}`.trim()
    );
    console.log();

    for (let i = 0; i < messageCount; i++) {
        const text = pick(MESSAGE_POOL);
        const clientBatchId = randomUid();

        try {
            const msgId = await sendMessage(
                patientId,
                patientId,
                text,
                clientBatchId,
                0
            );
            console.log(`  [${i + 1}/${messageCount}] Sent: "${text}"`);
            console.log(`           Message ID: ${msgId}`);
        } catch (err) {
            console.error(`  ✗ Failed to send message ${i + 1}:`, err.message);
        }

        if (i < messageCount - 1) {
            process.stdout.write(`  Waiting ${delayMs}ms...`);
            await sleep(delayMs);
            process.stdout.write("\r                        \r");
        }
    }

    console.log(
        `\n  ✓ Done. Sent ${messageCount} messages as patient ${patientId}.\n`
    );
}

main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
});
