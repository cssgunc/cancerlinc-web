import { useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router";
import {
    useNotifications,
    type NotificationItem,
    type NotificationTier,
} from "~/hooks/useNotifications";
import { statusLabel, statusStyles } from "~/types/status";

const TIER_ACCENT: Record<NotificationTier, string> = {
    "urgent-mine": "border-l-4 border-red-700",
    urgent: "border-l-4 border-red-500",
    "active-mine": "border-l-4 border-yellow-400",
};

export default function NotificationBell() {
    const navigate = useNavigate();
    const { items, loading, hasRed } = useNotifications();
    const [open, setOpen] = useState(false);

    const count = items.length;

    function handleSelect(item: NotificationItem) {
        setOpen(false);
        navigate(`/member/${encodeURIComponent(item.id)}`);
    }

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label="Notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            >
                <Bell className="h-5 w-5" />
                {count > 0 ? (
                    <span
                        className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white ${
                            hasRed ? "bg-red-600" : "bg-yellow-500"
                        }`}
                    >
                        {count}
                    </span>
                ) : null}
            </button>

            {open ? (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                        <div className="border-b border-gray-100 px-4 py-3">
                            <p className="text-sm font-semibold text-gray-900">
                                Alerts
                            </p>
                        </div>

                        <div className="max-h-[60vh] overflow-y-auto">
                            {loading ? (
                                <p className="px-4 py-6 text-center text-sm text-gray-400">
                                    Checking for alerts…
                                </p>
                            ) : count === 0 ? (
                                <p className="px-4 py-6 text-center text-sm text-gray-400">
                                    No alerts
                                </p>
                            ) : (
                                items.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => handleSelect(item)}
                                        className={`flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-gray-50 ${TIER_ACCENT[item.tier]}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium text-gray-900">
                                                {item.name}
                                            </span>
                                            <span
                                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles(item.status)}`}
                                            >
                                                {statusLabel(item.status)}
                                            </span>
                                        </div>
                                        {item.lastMessageText ? (
                                            <span className="truncate text-xs text-gray-500">
                                                {item.lastMessageText}
                                            </span>
                                        ) : null}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
