import type { Timestamp } from "firebase/firestore";
import type { User } from "./user";

// Matches the exact structure in Firestore 'referrals' collection
export interface Referral {
    id: string;
    status: "pending" | "accepted" | "completed" | "rejected";

    patientId: string;
    socialWorkerId: string;

    referralFirstName?: string;
    referralLastName?: string;
    referralTitle?: string;
    referralEmail?: string;
    referralPhone?: string;

    type: string;
    notes: string;
    websiteUrl?: string;

    dateSubmitted: Timestamp;
    lastUpdated: Timestamp;
}

// The joined data structure used by the frontend components
export interface ReferralWithProvider extends Referral {
    socialWorker?: User;
}
