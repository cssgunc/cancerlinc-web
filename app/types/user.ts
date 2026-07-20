import type { Timestamp } from "firebase/firestore";

export interface User {
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "patient" | "social_worker" | "admin";
    isVerified: boolean;
    isBanned?: boolean; // true once a patient is denied by staff
    disabled?: boolean; // mirrors Firebase Auth disabled flag, set by Cloud Function
    phoneNumber?: string;
    hospital?: string; // Clinic name for providers
    profilePhotoUrl?: string;
    websiteUrl?: string; // Optional field for clinic websites
    banned?: boolean; // Blocks user from the chat feature when true
    createdAt: Timestamp;
}
