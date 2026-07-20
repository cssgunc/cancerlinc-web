import { useEffect, useMemo, useState } from "react";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "~/services/firebase_app";
import { useAuth } from "~/services/firebase_provider";
import { normalizeStatus, type PatientStatus } from "~/types/status";

// dark red (urgent + assigned to me) > red (urgent) > yellow (active + mine)
export type NotificationTier = "urgent-mine" | "urgent" | "active-mine";

export type NotificationItem = {
    id: string;
    name: string;
    lastMessageText: string;
    status: PatientStatus;
    tier: NotificationTier;
    assignedToMe: boolean;
    sortTime: number;
};

const TIER_RANK: Record<NotificationTier, number> = {
    "urgent-mine": 0,
    urgent: 1,
    "active-mine": 2,
};

function patientName(data: DocumentData): string {
    const full = `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim();
    return full || data.username || data.email || "Unknown patient";
}

function toItem(
    doc: QueryDocumentSnapshot<DocumentData>,
    uid: string
): NotificationItem {
    const data = doc.data();
    const status = normalizeStatus(data.status);
    const assignedToMe = data.assignedSocialWorkerId === uid;
    const tier: NotificationTier =
        status === "urgent"
            ? assignedToMe
                ? "urgent-mine"
                : "urgent"
            : "active-mine";

    return {
        id: doc.id,
        name: patientName(data),
        lastMessageText: data.lastMessageText ?? "",
        status,
        tier,
        assignedToMe,
        sortTime: data.lastContactTimestamp?.toMillis?.() ?? 0,
    };
}

/**
 * Live notification feed for the signed-in social worker. Two listeners load
 * independently so the panel fills in incrementally: urgent conversations first
 * (red tiers), then the user's active conversations (yellow).
 */
export function useNotifications() {
    const { user } = useAuth();
    const uid = user?.uid ?? "";

    const [urgentItems, setUrgentItems] = useState<NotificationItem[]>([]);
    const [activeItems, setActiveItems] = useState<NotificationItem[]>([]);
    const [loadedUrgent, setLoadedUrgent] = useState(false);
    const [loadedActive, setLoadedActive] = useState(false);

    useEffect(() => {
        if (!uid) {
            setUrgentItems([]);
            setActiveItems([]);
            setLoadedUrgent(false);
            setLoadedActive(false);
            return;
        }

        setLoadedUrgent(false);
        setLoadedActive(false);

        const usersRef = collection(db, "users");

        // Every urgent conversation awaiting a reply (anyone's).
        const urgentQuery = query(
            usersRef,
            where("role", "==", "patient"),
            where("status", "==", "urgent"),
            where("awaitingReply", "==", true),
            orderBy("lastContactTimestamp", "desc")
        );

        // My active conversations awaiting a reply.
        const activeQuery = query(
            usersRef,
            where("role", "==", "patient"),
            where("status", "==", "active"),
            where("assignedSocialWorkerId", "==", uid),
            where("awaitingReply", "==", true),
            orderBy("lastContactTimestamp", "desc")
        );

        const unsubUrgent = onSnapshot(
            urgentQuery,
            (snap) => {
                setUrgentItems(snap.docs.map((d) => toItem(d, uid)));
                setLoadedUrgent(true);
            },
            (error) => {
                console.error("Notifications (urgent) query failed:", error);
                setUrgentItems([]);
                setLoadedUrgent(true);
            }
        );

        const unsubActive = onSnapshot(
            activeQuery,
            (snap) => {
                setActiveItems(snap.docs.map((d) => toItem(d, uid)));
                setLoadedActive(true);
            },
            (error) => {
                console.error("Notifications (active) query failed:", error);
                setActiveItems([]);
                setLoadedActive(true);
            }
        );

        return () => {
            unsubUrgent();
            unsubActive();
        };
    }, [uid]);

    const items = useMemo(() => {
        return [...urgentItems, ...activeItems].sort((a, b) => {
            const rank = TIER_RANK[a.tier] - TIER_RANK[b.tier];
            return rank !== 0 ? rank : b.sortTime - a.sortTime;
        });
    }, [urgentItems, activeItems]);

    return {
        items,
        // True until at least one query has returned; the panel shows
        // "Checking for alerts…" during this window.
        loading: !loadedUrgent && !loadedActive,
        hasRed: items.some((i) => i.tier !== "active-mine"),
    };
}
