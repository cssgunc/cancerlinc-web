import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ArrowLeft, Ban, ShieldAlert, User as UserIcon } from "lucide-react";

import { db } from "~/services/firebase_app";
import { useAuth } from "~/services/firebase_provider";
import type { User } from "~/types/user";

export function meta() {
    return [
        { title: "Admin · User Profile — CancerLINC" },
        { name: "description", content: "Admin view of a user profile." },
    ];
}

export default function AdminUserPage() {
    const { userId } = useParams<{ userId: string }>();
    const { user: currentUser } = useAuth();

    const [profile, setProfile] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [banning, setBanning] = useState(false);

    // Confirm the signed-in user is an admin before showing controls
    useEffect(() => {
        if (!currentUser) {
            setIsAdmin(false);
            return;
        }
        (async () => {
            try {
                const snap = await getDoc(doc(db, "users", currentUser.uid));
                const data = snap.data() as User | undefined;
                setIsAdmin(data?.role === "admin");
            } catch {
                setIsAdmin(false);
            }
        })();
    }, [currentUser]);

    // Load the target user's profile
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const snap = await getDoc(doc(db, "users", userId));
                if (cancelled) return;
                if (!snap.exists()) {
                    setProfile(null);
                    setError("User not found.");
                } else {
                    setProfile({ uid: snap.id, ...snap.data() } as User);
                }
            } catch (err) {
                if (cancelled) return;
                setError(
                    err instanceof Error ? err.message : "Failed to load user."
                );
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId]);

    const handleBan = async () => {
        if (!userId) return;
        setBanning(true);
        setError(null);
        try {
            await updateDoc(doc(db, "users", userId), { banned: true });
            setProfile((prev) => (prev ? { ...prev, banned: true } : prev));
            setConfirmOpen(false);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to ban user."
            );
        } finally {
            setBanning(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Bar — matches _index layout */}
            <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
                <div className="container mx-auto flex items-center gap-4 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <img
                            src="/CancerLINC-Logo-1.png"
                            alt="CancerLINC Logo"
                            className="w-16 mb-4"
                        />
                    </div>
                    <div className="flex-1" />
                    <Link
                        to="/"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Dashboard
                    </Link>
                </div>
            </header>

            <main className="container mx-auto px-6 py-8">
                <h1 className="text-2xl font-semibold text-gray-900">
                    User Profile
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    Admin view of this user's account.
                </p>

                {loading && (
                    <div className="mt-8 flex items-center justify-center py-20">
                        <div
                            className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600"
                            role="status"
                            aria-label="Loading user"
                        />
                    </div>
                )}

                {!loading && error && (
                    <div
                        className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        role="alert"
                    >
                        {error}
                    </div>
                )}

                {!loading && profile && (
                    <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex items-center gap-4 border-b border-gray-100 px-6 py-5">
                            {profile.profilePhotoUrl ? (
                                <img
                                    src={profile.profilePhotoUrl}
                                    alt={`${profile.firstName} ${profile.lastName}`}
                                    className="h-16 w-16 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
                                    <UserIcon className="h-8 w-8 text-gray-500" />
                                </div>
                            )}
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-lg font-semibold text-gray-900">
                                        {profile.firstName} {profile.lastName}
                                    </h2>
                                    {profile.banned && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                                            <Ban className="h-3.5 w-3.5" />
                                            Banned
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-600">
                                    {profile.email}
                                </p>
                            </div>
                        </div>

                        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-2">
                            <div>
                                <dt className="text-sm font-medium text-gray-700">
                                    Role
                                </dt>
                                <dd className="mt-1 text-sm text-gray-900 capitalize">
                                    {profile.role.replace("_", " ")}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-700">
                                    Phone
                                </dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {profile.phoneNumber || "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-700">
                                    Hospital / Clinic
                                </dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {profile.hospital || "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-700">
                                    Email Verified
                                </dt>
                                <dd className="mt-1 text-sm text-gray-900">
                                    {profile.isVerified ? "Yes" : "No"}
                                </dd>
                            </div>
                        </dl>

                        {isAdmin && (
                            <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                                {profile.banned ? (
                                    <span className="text-sm text-gray-600">
                                        This user is banned from the chat
                                        feature.
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmOpen(true)}
                                        className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-red-700"
                                    >
                                        <Ban className="h-4 w-4" />
                                        Ban User
                                    </button>
                                )}
                            </div>
                        )}

                        {isAdmin === false && (
                            <div className="border-t border-gray-100 bg-yellow-50 px-6 py-3 text-sm text-yellow-800">
                                You must be an admin to manage this user.
                            </div>
                        )}
                    </section>
                )}
            </main>

            {confirmOpen && profile && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="fixed inset-0 bg-black/50"
                        onClick={() => !banning && setConfirmOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="ban-confirm-title"
                        className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                                <ShieldAlert className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <h2
                                    id="ban-confirm-title"
                                    className="text-lg font-semibold text-gray-900"
                                >
                                    Ban this user?
                                </h2>
                                <p className="mt-1 text-sm text-gray-600">
                                    {profile.firstName} {profile.lastName} will
                                    no longer be able to access the chat
                                    feature. You can undo this later from their
                                    profile.
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setConfirmOpen(false)}
                                disabled={banning}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleBan}
                                disabled={banning}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                                <Ban className="h-4 w-4" />
                                {banning ? "Banning…" : "Ban User"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
