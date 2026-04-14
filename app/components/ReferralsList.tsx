import React from "react";
import type { ReferralWithProvider } from "~/types/referral";
import ReferralCard from "~/components/ReferralCard";

interface ReferralsListProps {
    referrals: ReferralWithProvider[];
    onAdd: () => void;
    onEdit: (referral: ReferralWithProvider) => void;
    onDelete: (id: string) => void;
}

export default function ReferralsList({
    referrals,
    onAdd,
    onEdit,
    onDelete,
}: ReferralsListProps) {
    return (
        <div className="flex w-full max-w-sm flex-col">
            {/* Header Title */}
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-semibold text-black">
                    David Thompsons Referrals
                    {/*Currently hardcoded, but later will pass user/patient name after collection has been setup*/}
                </h2>
                <button
                    className="text-sm font-medium text-gray-500 hover:text-black underline transition-colors"
                    onClick={onAdd}
                >
                    + Add
                </button>
            </div>

            {/* List Container - Matches the big bordered box in Figma */}
            <div className="relative flex flex-col pt-4 pb-4">
                {referrals.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center py-16">
                        <p className="text-sm text-gray-500">
                            No referrals found.
                        </p>
                    </div>
                ) : (
                    /* Scrollable inner area */
                    <div
                        className="flex-1 overflow-y-auto pr-2 space-y-5
                                    scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300"
                    >
                        {referrals.map((referral) => (
                            <ReferralCard
                                key={referral.id}
                                referral={referral}
                                onDelete={onDelete}
                                onEdit={() => onEdit(referral)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
