const MB_IN_BYTES = 1024 * 1024;

export const CHAT_ATTACHMENT_SETTINGS = {
    acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
    acceptedFileExtensionsLabel: ".jpg, .jpeg, .png, .webp",
    maxImageSizeBytes: 10 * MB_IN_BYTES,
    storageRootPath: "chatAttachments",
} as const;

export const CHAT_SUMMARY_LABELS = {
    imageOnly: "Sent a photo",
    imageWithTextSuffix: " (photo attached)",
} as const;

export function formatMaxImageSizeLabel() {
    return `${Math.round(CHAT_ATTACHMENT_SETTINGS.maxImageSizeBytes / MB_IN_BYTES)} MB`;
}
