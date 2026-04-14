import type { Timestamp } from "firebase/firestore";

export interface User {
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: "patient" | "social_worker" | "admin";
    isVerified: boolean;
    phoneNumber?: string;
    hospital?: string; // Clinic name for providers
    profilePhotoUrl?: string;
    websiteUrl?: string; // Optional field for clinic websites
    createdAt: Timestamp;
}
