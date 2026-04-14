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
}

export default function ReferralFormDialog({
    open,
    onClose,
    onSubmit,
    initialData,
    title,
    patientId,
}: ReferralFormDialogProps) {
    const [formData, setFormData] = useState<ReferralFormData>({
        patientId: patientId,
        socialWorkerId: "",

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
                patientId: patientId,
                socialWorkerId: initialData?.socialWorkerId ?? "",

                referralFirstName: initialData?.referralFirstName ?? "",
                referralLastName: initialData?.referralLastName ?? "",
                referralTitle: initialData?.referralTitle ?? "",
                referralEmail: initialData?.referralEmail ?? "",
                referralPhone: initialData?.referralPhone ?? "",

                type: initialData?.type ?? "",
                status: initialData?.status ?? "pending",
                notes: initialData?.notes ?? "",
                websiteUrl: initialData?.websiteUrl ?? "",
            });
        } else {
            setFormData({
                patientId: patientId,
                socialWorkerId: "",

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
    }, [initialData, open, patientId]);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Dialog */}
            <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Display Patient ID as read-only */}
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            Patient ID
                        </label>
                        <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                            {patientId}
                        </div>
                    </div>

                    {/* Social Worker ID field */}
                    <div>
                        <label
                            htmlFor="socialWorkerId"
                            className="mb-1 block text-sm font-medium text-gray-700"
                        >
                            Social Worker ID
                        </label>
                        <input
                            id="socialWorkerId"
                            name="socialWorkerId"
                            type="text"
                            required
                            value={formData.socialWorkerId}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                       focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="referralFirstName"
                            className="mb-1 block text-sm font-medium text-gray-700"
                        >
                            Referral First Name
                        </label>
                        <input
                            id="referralFirstName"
                            name="referralFirstName"
                            type="text"
                            value={formData.referralFirstName}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                    focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="referralLastName"
                            className="mb-1 block text-sm font-medium text-gray-700"
                        >
                            Referral Last Name
                        </label>
                        <input
                            id="referralLastName"
                            name="referralLastName"
                            type="text"
                            value={formData.referralLastName}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                    focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="referralTitle"
                            className="mb-1 block text-sm font-medium text-gray-700"
                        >
                            Referral Title
                        </label>
                        <input
                            id="referralTitle"
                            name="referralTitle"
                            type="text"
                            value={formData.referralTitle}
                            onChange={handleChange}
                            placeholder="e.g. Oncologist"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                    focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="referralEmail"
                            className="mb-1 block text-sm font-medium text-gray-700"
                        >
                            Referral Email
                        </label>
                        <input
                            id="referralEmail"
                            name="referralEmail"
                            type="email"
                            value={formData.referralEmail}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                    focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="referralPhone"
                            className="mb-1 block text-sm font-medium text-gray-700"
                        >
                            Referral Phone
                        </label>
                        <input
                            id="referralPhone"
                            name="referralPhone"
                            type="text"
                            value={formData.referralPhone}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                    focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                       focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                       focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                       focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900
                                       focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium
                                       text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium
                                       text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {submitting ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
