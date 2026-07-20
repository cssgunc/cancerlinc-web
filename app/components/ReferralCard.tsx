import { MoreHorizontal, ExternalLink } from "lucide-react";
import type { ReferralWithProvider } from "~/types/referral";

interface ReferralCardProps {
    referral: ReferralWithProvider;
    onEdit: () => void;
    onDelete: (id: string) => void;
}

export default function ReferralCard({
    referral,
    onEdit,
    onDelete,
}: ReferralCardProps) {
    const contactName =
        `${referral.referralFirstName ?? ""} ${referral.referralLastName ?? ""}`.trim() ||
        "Unknown";
    const title = referral.referralTitle || "";
    const phone = referral.referralPhone || "";
    const email = referral.referralEmail || "";
    const websiteUrl = referral.websiteUrl?.trim() || "";

    const socialWorkerName = referral.socialWorker
        ? `${referral.socialWorker.firstName ?? ""} ${referral.socialWorker.lastName ?? ""}`.trim()
        : "";

    const statusColors: Record<string, string> = {
        pending: "bg-yellow-100 text-yellow-800",
        accepted: "bg-green-100 text-green-800",
        completed: "bg-blue-100 text-blue-800",
        rejected: "bg-red-100 text-red-800",
    };
    const statusStyle =
        statusColors[referral.status] || "bg-gray-100 text-gray-800";

    return (
        <article className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors">
            {/* Options Menu */}
            <div className="absolute right-2 top-2 group z-10">
                <button
                    type="button"
                    className="p-1 text-gray-900 hover:text-gray-500 transition"
                    aria-label="More options"
                >
                    <MoreHorizontal className="h-5 w-5" />
                </button>

                <div className="absolute right-0 top-full hidden w-32 flex-col pt-1 group-hover:flex">
                    <div className="flex flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                        <button
                            onClick={onEdit}
                            className="px-4 py-2 text-left text-[14px] text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => {
                                if (window.confirm("Delete this referral?")) {
                                    onDelete(referral.id);
                                }
                            }}
                            className="px-4 py-2 text-left text-[14px] text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            {/* Status Badge */}
            <span
                className={`absolute right-2 top-10 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusStyle}`}
            >
                {referral.status}
            </span>

            {/* Content */}
            <div className="pr-8">
                <h3 className="text-[15px] font-bold text-gray-900 leading-tight">
                    {contactName}
                </h3>
                {title ? (
                    <p className="text-[14px] font-bold text-gray-900 leading-tight">
                        {title}
                    </p>
                ) : null}

                <div className="mt-2 text-[14px] text-gray-900 leading-snug">
                    {phone ? <p>{phone}</p> : null}
                    {email ? <p>{email}</p> : null}
                </div>

                {socialWorkerName ? (
                    <p className="mt-3 text-[14px] font-bold text-gray-900">
                        Referred By: {socialWorkerName}
                    </p>
                ) : null}

                <div className="mt-2">
                    {websiteUrl ? (
                        <a
                            href={websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded bg-[#A3D146] px-4 py-1.5 text-[14px] font-medium text-black hover:bg-[#92BC3F] transition-colors"
                        >
                            Website
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-4 py-1.5 text-[14px] font-medium text-gray-400 cursor-not-allowed">
                            Website
                            <ExternalLink className="h-3.5 w-3.5" />
                        </span>
                    )}
                </div>
            </div>
        </article>
    );
}
