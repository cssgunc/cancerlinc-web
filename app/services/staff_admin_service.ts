import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase_app";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateStaffAccountInput {
    email: string;
    firstName: string;
    lastName: string;
    displayName?: string;
    hospital?: string;
}

export interface CreateStaffAccountResult {
    uid: string;
    emailEnqueued: boolean;
}

export interface SetStaffDisabledInput {
    uid: string;
    disabled: boolean;
}

export interface SetStaffDisabledResult {
    success: boolean;
}

export interface DeleteStaffAccountInput {
    uid: string;
}

export interface DeleteStaffAccountResult {
    success: boolean;
}

// ─── Callable references ──────────────────────────────────────────────────────

const _createStaffAccount = httpsCallable<
    CreateStaffAccountInput,
    CreateStaffAccountResult
>(functions, "createStaffAccount");

const _setStaffDisabled = httpsCallable<
    SetStaffDisabledInput,
    SetStaffDisabledResult
>(functions, "setStaffDisabled");

const _deleteStaffAccount = httpsCallable<
    DeleteStaffAccountInput,
    DeleteStaffAccountResult
>(functions, "deleteStaffAccount");

// ─── Exported async wrappers ──────────────────────────────────────────────────

export async function createStaffAccount(
    input: CreateStaffAccountInput
): Promise<CreateStaffAccountResult> {
    const result = await _createStaffAccount(input);
    return result.data;
}

export async function setStaffDisabled(
    input: SetStaffDisabledInput
): Promise<SetStaffDisabledResult> {
    const result = await _setStaffDisabled(input);
    return result.data;
}

export async function deleteStaffAccount(
    input: DeleteStaffAccountInput
): Promise<DeleteStaffAccountResult> {
    const result = await _deleteStaffAccount(input);
    return result.data;
}

// ─── Superuser gate (client-side UX only; real enforcement is server-side) ───

export function isSuperuser(email?: string | null): boolean {
    const superuserEmail = import.meta.env.VITE_SUPERUSER_EMAIL;
    if (!email || !superuserEmail) return false;
    return email.toLowerCase() === superuserEmail.toLowerCase();
}
