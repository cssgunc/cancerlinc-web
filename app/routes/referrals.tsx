import React, { useState } from "react";
import ReferralsList from "~/components/ReferralsList";
import ReferralFormDialog from "~/components/ReferralFormDialog";
import {
    useReferrals,
    addReferral,
    editReferral,
    deleteReferral,
} from "~/hooks/useReferrals";
import type { ReferralFormData } from "~/hooks/useReferrals";
import type { ReferralWithProvider } from "~/types/referral";
import { useAuth } from "~/services/firebase_provider";

export function meta() {
    return [
        { title: "Referrals — CancerLINC" },
        { name: "description", content: "View and manage patient referrals." },
    ];
}
// THIS PAGE IS TEMPORARY AND ONLY TO SHOW THE REFERRALS CARD AND REFERRALS LIST.
// Those components will later be merged into the member/profile page where both messages and referrals will be.

export default function ReferralsPage() {
    const { user } = useAuth();
    // TODO: get this from route params or auth context
    const patientId = "3"; // Can change to update DB

    const { referrals, loading, error } = useReferrals(patientId);

    // Dialog state
    const [formOpen, setFormOpen] = useState(false);
    const [editingReferral, setEditingReferral] =
        useState<ReferralWithProvider | null>(null);

    // --- Handlers ---

    const handleAdd = () => {
        setEditingReferral(null);
        setFormOpen(true);
    };

    const handleEdit = (referral: ReferralWithProvider) => {
        setEditingReferral(referral);
        setFormOpen(true);
    };

    const handleFormSubmit = async (data: ReferralFormData) => {
        if (editingReferral) {
            await editReferral(patientId, editingReferral.id, data);
        } else {
            await addReferral(patientId, data);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteReferral(patientId, id);
        } catch (err) {
            console.error("Failed to delete referral:", err);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Bar — matches _index layout */}
            <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
                <div className="container mx-auto flex items-center gap-4 px-6 py-4">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <img
                            src="/CancerLINC-Logo-1.png"
                            alt="CancerLINC Logo"
                            className="w-16 mb-4"
                        />
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Welcome / Logout */}
                    <div className="ml-auto hidden items-center gap-4 text-sm text-gray-600 md:flex">
                        <span>Welcome, Emily</span>{" "}
                        {/*TODO: Based on logged in user */}
                        <a
                            href="#"
                            className="font-medium text-gray-900 underline underline-offset-2"
                        >
                            Logout
                        </a>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="px-10 py-8">
                <h1 className="text-2xl font-semibold text-gray-900">
                    Referrals
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    Browse and manage patient referrals.
                </p>

                <section className="mt-8">
                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <div
                                className="h-8 w-8 animate-spin rounded-full border-4
                                           border-gray-200 border-t-indigo-600"
                                role="status"
                                aria-label="Loading referrals"
                            />
                        </div>
                    )}

                    {error && (
                        <div
                            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                            role="alert"
                        >
                            Failed to load referrals: {error}
                        </div>
                    )}

                    {!loading && !error && (
                        <ReferralsList
                            referrals={referrals}
                            onAdd={handleAdd}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    )}
                </section>
            </main>

            {/* Add / Edit Dialog */}
            <ReferralFormDialog
                open={formOpen}
                onClose={() => setFormOpen(false)}
                onSubmit={handleFormSubmit}
                initialData={editingReferral}
                title={editingReferral ? "Edit Referral" : "Add New Referral"}
                patientId={patientId}
                socialWorkerId={user?.uid ?? ""}
            />
        </div>
    );
}
