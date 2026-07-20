export type PatientStatus = "urgent" | "active" | "inactive" | "closed";

export const PATIENT_STATUSES: PatientStatus[] = [
    "urgent",
    "active",
    "inactive",
    "closed",
];

const DEFAULT_STATUS: PatientStatus = "closed";

// Coerce an unknown/legacy value into a valid PatientStatus.
export function normalizeStatus(value: unknown): PatientStatus {
    return PATIENT_STATUSES.includes(value as PatientStatus)
        ? (value as PatientStatus)
        : DEFAULT_STATUS;
}

export function statusLabel(status: PatientStatus): string {
    switch (status) {
        case "urgent":
            return "Urgent";
        case "active":
            return "Active";
        case "inactive":
            return "Inactive";
        case "closed":
            return "Closed";
    }
}

export function statusStyles(status: PatientStatus): string {
    switch (status) {
        case "urgent":
            return "bg-red-50 text-red-700 ring-1 ring-red-200";
        case "active":
            return "bg-green-50 text-green-700 ring-1 ring-green-200";
        case "inactive":
            return "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200";
        case "closed":
            return "bg-gray-100 text-gray-700 ring-1 ring-gray-200";
    }
}
