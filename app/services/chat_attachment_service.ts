import {
    arrayUnion,
    collection,
    doc,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import {
    deleteObject,
    getDownloadURL,
    ref,
    uploadBytes,
} from "firebase/storage";

import {
    CHAT_ATTACHMENT_SETTINGS,
    CHAT_SUMMARY_LABELS,
    formatMaxImageSizeLabel,
} from "./chat_settings";
import { db, storage } from "./firebase_app";

export type SendChatMessageInput = {
    chatId: string;
    senderId: string;
    senderName?: string;
    text?: string;
    imageFile?: File | null;
};

export type ChatMessageKind = "text" | "image";

export class ChatAttachmentValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ChatAttachmentValidationError";
    }
}

function getFileExtension(file: File) {
    const extensionFromName = file.name.split(".").pop()?.toLowerCase();

    if (extensionFromName) {
        return extensionFromName;
    }

    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";

    return "bin";
}

function buildChatSummary(text: string, hasImage: boolean) {
    if (!hasImage) {
        return text;
    }

    if (!text) {
        return CHAT_SUMMARY_LABELS.imageOnly;
    }

    return `${text}${CHAT_SUMMARY_LABELS.imageWithTextSuffix}`;
}

export function validateChatImageFile(file: File) {
    if (
        !CHAT_ATTACHMENT_SETTINGS.acceptedMimeTypes.includes(file.type as never)
    ) {
        throw new ChatAttachmentValidationError(
            `Unsupported image type. Allowed: ${CHAT_ATTACHMENT_SETTINGS.acceptedFileExtensionsLabel}.`
        );
    }

    if (file.size > CHAT_ATTACHMENT_SETTINGS.maxImageSizeBytes) {
        throw new ChatAttachmentValidationError(
            `Image exceeds the ${formatMaxImageSizeLabel()} limit.`
        );
    }
}

export async function sendChatMessageWithOptionalImage({
    chatId,
    senderId,
    senderName,
    text,
    imageFile,
}: SendChatMessageInput) {
    const trimmedText = text?.trim() ?? "";
    const hasText = trimmedText.length > 0;
    const hasImage = Boolean(imageFile);

    if (!hasText && !hasImage) {
        throw new ChatAttachmentValidationError(
            "Add a message or image before sending."
        );
    }

    if (imageFile) {
        validateChatImageFile(imageFile);
    }

    const clientBatchId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const chatRef = doc(db, "chats", chatId);
    const patientRef = doc(db, "users", chatId);
    const messagesRef = collection(db, "chats", chatId, "messages");
    const textMessageRef = hasText ? doc(messagesRef) : null;
    const imageMessageRef = hasImage ? doc(messagesRef) : null;

    let uploadedImageRef: ReturnType<typeof ref> | null = null;
    let uploadedImageUrl: string | null = null;

    if (imageFile && imageMessageRef) {
        const imageExtension = getFileExtension(imageFile);
        uploadedImageRef = ref(
            storage,
            `${CHAT_ATTACHMENT_SETTINGS.storageRootPath}/${chatId}/${imageMessageRef.id}.${imageExtension}`
        );
        await uploadBytes(uploadedImageRef, imageFile, {
            contentType: imageFile.type,
            customMetadata: {
                chatId,
                messageId: imageMessageRef.id,
                senderId,
                clientBatchId,
            },
        });
        uploadedImageUrl = await getDownloadURL(uploadedImageRef);
    }

    try {
        const batch = writeBatch(db);

        if (textMessageRef) {
            batch.set(textMessageRef, {
                messageId: textMessageRef.id,
                senderId,
                senderName: senderName ?? "",
                content: trimmedText,
                messageType: "text" satisfies ChatMessageKind,
                clientBatchId,
                clientOrder: 0,
                timestamp: serverTimestamp(),
                isRead: false,
            });
        }

        if (imageMessageRef && uploadedImageUrl && imageFile) {
            batch.set(imageMessageRef, {
                messageId: imageMessageRef.id,
                senderId,
                senderName: senderName ?? "",
                content: "",
                messageType: "image" satisfies ChatMessageKind,
                imageUrl: uploadedImageUrl,
                imagePath: uploadedImageRef?.fullPath ?? "",
                imageMimeType: imageFile.type,
                imageFileName: imageFile.name,
                imageSizeBytes: imageFile.size,
                clientBatchId,
                clientOrder: textMessageRef ? 1 : 0,
                timestamp: serverTimestamp(),
                isRead: false,
            });
        }

        batch.set(
            chatRef,
            {
                chatId,
                participants: arrayUnion(senderId, chatId),
                lastMessage: buildChatSummary(trimmedText, hasImage),
                lastMessageTimestamp: serverTimestamp(),
                lastMessageBatchId: clientBatchId,
            },
            { merge: true }
        );

        batch.set(
            patientRef,
            {
                lastContactTimestamp: serverTimestamp(),
            },
            { merge: true }
        );

        await batch.commit();

        return { clientBatchId };
    } catch (error) {
        if (uploadedImageRef) {
            try {
                await deleteObject(uploadedImageRef);
            } catch {
                // Best-effort cleanup if Firestore fails after the upload succeeds.
            }
        }

        throw error;
    }
}
