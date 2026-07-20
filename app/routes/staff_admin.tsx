import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "~/services/firebase_app";
import { useAuth } from "~/services/firebase_provider";
import {
    isSuperuser,
    createStaffAccount,
    setStaffDisabled,
    deleteStaffAccount,
} from "~/services/staff_admin_service";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StaffUser {
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    disabled?: boolean;
    isVerified?: boolean;
    isBanned?: boolean;
}

// ─── Delete-confirm modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
    staff: StaffUser;
    onConfirm: () => void;
    onCancel: () => void;
    isDeleting: boolean;
}

function DeleteModal({
    staff,
    onConfirm,
    onCancel,
    isDeleting,
}: DeleteModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white w-full max-w-sm rounded-xl p-6 shadow-xl">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    Delete staff account?
                </h2>
                <p className="text-sm text-gray-600 mb-6">
                    This will permanently delete{" "}
                    <span className="font-medium">
                        {staff.firstName} {staff.lastName}
                    </span>{" "}
                    ({staff.email}). This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isDeleting}
                        className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="px-4 py-2 rounded-lg bg-red-600 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                        {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Friendly error mapper ─────────────────────────────────────────────────────

function friendlyError(err: unknown): string {
    if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("already-exists")) {
            return "An account with that email already exists.";
        }
        if (msg.includes("permission-denied")) {
            return "You do not have permission to perform this action.";
        }
        if (msg.includes("invalid-argument")) {
            return "Please check your input and try again.";
        }
        if (msg.includes("not-found")) {
            return "This account could not be found. It may have already been removed.";
        }
        if (msg.includes("internal")) {
            return "Something went wrong on our end. Please try again.";
        }
        return msg;
    }
    return "An unexpected error occurred.";
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function StaffAdmin() {
    const { user } = useAuth();

    // Gate: non-superusers are redirected immediately (real gate is server-side)
    if (!isSuperuser(user?.email)) {
        return <Navigate to="/" replace />;
    }

    return <StaffAdminInner />;
}

function StaffAdminInner() {
    // ── Create form state ──
    const [email, setEmail] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createSuccess, setCreateSuccess] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);

    // ── Staff list state ──
    const [staffList, setStaffList] = useState<StaffUser[]>([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);

    // ── Row-level action state ──
    const [togglingUid, setTogglingUid] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<StaffUser | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [rowError, setRowError] = useState<string | null>(null);

    // ── Realtime staff subscription ──
    useEffect(() => {
        const q = query(
            collection(db, "users"),
            where("role", "in", ["social_worker", "admin"])
        );

        const unsub = onSnapshot(
            q,
            (snap) => {
                const members: StaffUser[] = snap.docs.map((doc) => ({
                    uid: doc.id,
                    ...(doc.data() as Omit<StaffUser, "uid">),
                }));
                setStaffList(members);
                setListLoading(false);
            },
            () => {
                setListError("Failed to load staff list.");
                setListLoading(false);
            }
        );

        return unsub;
    }, []);

    // ── Handlers ──

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (isSubmitting) return;
        setCreateError(null);
        setCreateSuccess(null);
        setIsSubmitting(true);
        try {
            await createStaffAccount({
                email,
                firstName,
                lastName,
                displayName: `${firstName} ${lastName}`,
            });
            setCreateSuccess(`Invite sent to ${email}`);
            setEmail("");
            setFirstName("");
            setLastName("");
        } catch (err) {
            setCreateError(friendlyError(err));
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleToggleDisabled(staff: StaffUser) {
        setRowError(null);
        setTogglingUid(staff.uid);
        try {
            await setStaffDisabled({
                uid: staff.uid,
                disabled: !staff.disabled,
            });
        } catch (err) {
            setRowError(friendlyError(err));
        } finally {
            setTogglingUid(null);
        }
    }

    async function handleDeleteConfirm() {
        if (!pendingDelete) return;
        setIsDeleting(true);
        setRowError(null);
        try {
            await deleteStaffAccount({ uid: pendingDelete.uid });
            setPendingDelete(null);
        } catch (err) {
            setRowError(friendlyError(err));
            setPendingDelete(null);
        } finally {
            setIsDeleting(false);
        }
    }

    // ── Render ──

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            {pendingDelete ? (
                <DeleteModal
                    staff={pendingDelete}
                    onConfirm={handleDeleteConfirm}
                    onCancel={() => setPendingDelete(null)}
                    isDeleting={isDeleting}
                />
            ) : null}

            <div className="mx-auto max-w-3xl space-y-10">
                {/* Page title */}
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        Staff Management
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Create staff accounts and manage existing staff members.
                    </p>
                </div>

                {/* ── Create Staff Form ── */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-lg font-medium text-gray-800 mb-4">
                        Add New Staff Member
                    </h2>
                    <form className="space-y-4" onSubmit={handleCreate}>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <div className="flex items-center border rounded-lg px-3 py-2">
                                <input
                                    type="email"
                                    className="w-full outline-none text-gray-700"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    First Name
                                </label>
                                <div className="flex items-center border rounded-lg px-3 py-2">
                                    <input
                                        type="text"
                                        className="w-full outline-none text-gray-700"
                                        value={firstName}
                                        onChange={(e) =>
                                            setFirstName(e.target.value)
                                        }
                                        required
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Last Name
                                </label>
                                <div className="flex items-center border rounded-lg px-3 py-2">
                                    <input
                                        type="text"
                                        className="w-full outline-none text-gray-700"
                                        value={lastName}
                                        onChange={(e) =>
                                            setLastName(e.target.value)
                                        }
                                        required
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>
                        </div>

                        {createSuccess ? (
                            <p className="text-sm text-green-600">
                                {createSuccess}
                            </p>
                        ) : null}
                        {createError ? (
                            <p className="text-sm text-red-600">
                                {createError}
                            </p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            aria-busy={isSubmitting}
                            className="w-full bg-black text-white py-2 rounded-lg hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? "SENDING INVITE..." : "SEND INVITE"}
                        </button>
                    </form>
                </div>

                {/* ── Staff List ── */}
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 px-6 py-4">
                        <h2 className="text-lg font-medium text-gray-800">
                            Current Staff
                        </h2>
                    </div>

                    {rowError ? (
                        <p className="px-6 pt-4 text-sm text-red-600">
                            {rowError}
                        </p>
                    ) : null}

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 text-left text-sm text-gray-600 select-none">
                                <tr>
                                    <th className="px-6 py-4 font-medium">
                                        Name
                                    </th>
                                    <th className="px-6 py-4 font-medium">
                                        Email
                                    </th>
                                    <th className="px-6 py-4 font-medium">
                                        Status
                                    </th>
                                    <th className="px-6 py-4 font-medium">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {listLoading ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="px-6 py-10 text-center text-gray-400"
                                        >
                                            Loading staff...
                                        </td>
                                    </tr>
                                ) : listError ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="px-6 py-10 text-center text-sm text-red-600"
                                        >
                                            {listError}
                                        </td>
                                    </tr>
                                ) : staffList.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="px-6 py-10 text-center text-sm text-gray-400"
                                        >
                                            No staff members found.
                                        </td>
                                    </tr>
                                ) : (
                                    staffList.map((staff) => (
                                        <tr
                                            key={staff.uid}
                                            className="hover:bg-gray-50/60"
                                        >
                                            <td className="px-6 py-4 font-medium text-gray-900">
                                                {staff.firstName}{" "}
                                                {staff.lastName}
                                            </td>
                                            <td className="px-6 py-4 text-gray-700">
                                                {staff.email}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                                                        staff.disabled
                                                            ? "bg-red-100 text-red-700"
                                                            : "bg-green-100 text-green-700"
                                                    }`}
                                                >
                                                    {staff.disabled
                                                        ? "Disabled"
                                                        : "Active"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handleToggleDisabled(
                                                                staff
                                                            )
                                                        }
                                                        disabled={
                                                            togglingUid ===
                                                            staff.uid
                                                        }
                                                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        {togglingUid ===
                                                        staff.uid
                                                            ? "..."
                                                            : staff.disabled
                                                              ? "Enable"
                                                              : "Disable"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPendingDelete(
                                                                staff
                                                            )
                                                        }
                                                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
