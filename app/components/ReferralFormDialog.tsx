import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { ReferralFormData } from "~/hooks/useReferrals";
import type { ReferralWithProvider } from "~/types/referral";

interface ReferralFormDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: ReferralFormData) => Promise<void>;
    initialData?: ReferralWithProvider | null;
    title: string;
    patientId: string;
    socialWorkerId: string;
}

export default function ReferralFormDialog({
    open,
    onClose,
    onSubmit,
    initialData,
    title,
    patientId,
    socialWorkerId,
}: ReferralFormDialogProps) {
    const [formData, setFormData] = useState<ReferralFormData>({
        patientId,
        socialWorkerId,

        referralFirstName: "",
        referralLastName: "",
        referralTitle: "",
        referralEmail: "",
        referralPhone: "",

        type: "",
        status: "pending",
        notes: "",
        websiteUrl: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (initialData) {
            setFormData({
                patientId,
                socialWorkerId: initialData.socialWorkerId ?? socialWorkerId,

                referralFirstName: initialData.referralFirstName ?? "",
                referralLastName: initialData.referralLastName ?? "",
                referralTitle: initialData.referralTitle ?? "",
                referralEmail: initialData.referralEmail ?? "",
                referralPhone: initialData.referralPhone ?? "",

                type: initialData.type ?? "",
                status: initialData.status ?? "pending",
                notes: initialData.notes ?? "",
                websiteUrl: initialData.websiteUrl ?? "",
            });
        } else {
            setFormData({
                patientId,
                socialWorkerId,

                referralFirstName: "",
                referralLastName: "",
                referralTitle: "",
                referralEmail: "",
                referralPhone: "",

                type: "",
                status: "pending",
                notes: "",
                websiteUrl: "",
            });
        }

        setError(null);
    }, [initialData, open, patientId, socialWorkerId]);

    if (!open) return null;

    const handleChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await onSubmit(formData);
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Dialog */}
            <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
                {/* Pinned header */}
                <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    {/* Scrollable body */}
                    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                        {error && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <div>
                            <label
                                htmlFor="referralFirstName"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                First Name
                            </label>
                            <input
                                id="referralFirstName"
                                name="referralFirstName"
                                type="text"
                                value={formData.referralFirstName}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="referralLastName"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Last Name
                            </label>
                            <input
                                id="referralLastName"
                                name="referralLastName"
                                type="text"
                                value={formData.referralLastName}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="referralTitle"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Title
                            </label>
                            <input
                                id="referralTitle"
                                name="referralTitle"
                                type="text"
                                value={formData.referralTitle}
                                onChange={handleChange}
                                placeholder="e.g. Oncologist"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="referralEmail"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Email
                            </label>
                            <input
                                id="referralEmail"
                                name="referralEmail"
                                type="email"
                                value={formData.referralEmail}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="referralPhone"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Phone
                            </label>
                            <input
                                id="referralPhone"
                                name="referralPhone"
                                type="text"
                                value={formData.referralPhone}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="type"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Referral Type
                            </label>
                            <input
                                id="type"
                                name="type"
                                type="text"
                                required
                                value={formData.type}
                                onChange={handleChange}
                                placeholder="e.g. Neurology, Oncology"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="status"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Status
                            </label>
                            <select
                                id="status"
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="pending">Pending</option>
                                <option value="accepted">Accepted</option>
                                <option value="rejected">Rejected</option>
                                <option value="completed">Completed</option>
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="notes"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Notes
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                rows={3}
                                value={formData.notes}
                                onChange={handleChange}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="websiteUrl"
                                className="mb-1 block text-sm font-medium text-gray-700"
                            >
                                Website URL
                            </label>
                            <input
                                id="websiteUrl"
                                name="websiteUrl"
                                type="url"
                                value={formData.websiteUrl}
                                onChange={handleChange}
                                placeholder="https://example.com"
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Pinned footer */}
                    <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {submitting ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
