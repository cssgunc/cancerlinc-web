# Chat Messaging

This document covers the messaging implementation for [`member.tsx`](/workspace/app/routes/member.tsx). The feature supports one optional image per send action and stores text and image content as separate Firestore message documents that share a `clientBatchId`.

## What was added

- Firebase Storage initialization in [`firebase_app.ts`](/workspace/app/services/firebase_app.ts)
- chat-specific config in [`chat_settings.ts`](/workspace/app/services/chat_settings.ts)
- upload/message orchestration in [`chat_attachment_service.ts`](/workspace/app/services/chat_attachment_service.ts)
- composer preview, validation, image rendering, and single-click send in [`member.tsx`](/workspace/app/routes/member.tsx)
- Firebase rules and config in [`firebase.json`](/workspace/firebase.json), [`firestore.rules`](/workspace/firebase/firestore.rules), and [`storage.rules`](/workspace/firebase/storage.rules)

## Chat ID and participant model

Each chat's ID is the **patient's UID**. All messages between a patient and any number of social workers are stored under `Chats/{patientId}/messages/{messageId}`. This means every social worker accesses the same single chat per patient — there is no per-pair chat.

The `participants` field on the chat document is an array that grows over time via `arrayUnion`. Every time a social worker sends a message, their UID and the patient UID (which equals `chatId`) are merged into the array. The `senderId` field on each message document records who sent it, and the UI displays the sender's name above received message bubbles.

## Message model

For a text-only send, one Firestore document is created under `chats/{chatId}/messages/{messageId}` with:

- `messageType: "text"`
- `content`
- `clientBatchId`
- `clientOrder`

For an image-only send, one Firestore document is created with:

- `messageType: "image"`
- `imageUrl`
- `imagePath`
- `imageMimeType`
- `imageFileName`
- `imageSizeBytes`
- `clientBatchId`
- `clientOrder`

For a text+image send, two message documents are created in one Firestore batch:

- the text document uses `clientOrder: 0`
- the image document uses `clientOrder: 1`
- both share the same `clientBatchId`

The parent chat summary is updated on the `chats/{chatId}` document using configurable labels from [`chat_settings.ts`](/workspace/app/services/chat_settings.ts).

## Configurable values

Change these values in [`chat_settings.ts`](/workspace/app/services/chat_settings.ts):

- allowed image MIME types
- accepted extension label shown in the UI
- max image size
- Storage root path, currently `chatAttachments`
- chat summary labels for image-only and text+image sends

Firebase runtime config values live in [`.env.template`](/workspace/.env.template):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

## Firebase Console setup required

Nothing in Firebase Console for Storage/rules is assumed to exist yet. These steps still need to be completed:

1. In the Firebase Console for project `cancerlinc-addb4`, open Storage and create the default bucket if it has not been initialized yet.
2. Pick the production bucket region deliberately. This is sensitive patient/social-worker traffic, so avoid ad hoc regional choices.
3. Confirm the bucket name matches `VITE_FIREBASE_STORAGE_BUCKET`. In the current local env this is `cancerlinc-addb4.firebasestorage.app`.
4. Deploy the rules in [`firestore.rules`](/workspace/firebase/firestore.rules) and [`storage.rules`](/workspace/firebase/storage.rules) with the Firebase CLI:

```bash
firebase use cancerlinc-addb4
firebase deploy --only firestore:rules,storage
```

5. Verify Authenticated users can already sign in, because both Firestore and Storage rules require `request.auth != null`.
6. Verify the app’s web config in [`.env`](/workspace/.env) or your deployment secret store matches the Firebase project you intend to use.

## Security and privacy notes

- The Storage path is chat-scoped: `chatAttachments/{chatId}/{messageId}.{ext}` where `chatId` is the patient's UID.
- Firestore chat reads are restricted to chat participants.
- A new chat document can be created by any signed-in user who includes themselves in `participants`. Subsequent updates require the user to already be a participant.
- Firestore message creation is restricted to the authenticated sender and blocks edits/deletes in v1.
- Storage reads and writes are restricted to users who participate in the parent chat.
- Storage writes are limited to image MIME types and the configured size cap.
- The service attempts best-effort Storage cleanup if upload succeeds but the Firestore batch fails.
- Download URLs are stored on the message document. Treat these conversations as sensitive data and keep bucket/rules review part of release sign-off.

## Current limitations

- No client-side compression in v1.
- No deletion flow in v1.
- Only a single image is supported per send action.
- Only image files are supported; PDFs and other file types are out of scope for v1.
- There are currently no automated tests covering this flow.

## Future follow-up

- Add client-side image compression before upload to reduce bandwidth and Storage cost.
- Add a post-send deletion or revoke flow with matching Firestore and Storage cleanup.
- Extend validation, UI, and rules to support PDFs or other approved attachment types.
