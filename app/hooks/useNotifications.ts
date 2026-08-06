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

// Priority tiers (highest first):
//   urgent-mine  → dark red  (urgent + assigned to me)
//   urgent       → red       (urgent, anyone)
//   mine         → yellow    (non-urgent + assigned to me)
//   other        → gray      (non-urgent, someone else's or unassigned)
export type NotificationTier = "urgent-mine" | "urgent" | "mine" | "other";

// Non-resolved statuses that can have a pending reply. "closed" is excluded.
const OPEN_STATUSES: PatientStatus[] = ["urgent", "active", "inactive"];

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
    mine: 2,
    other: 3,
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
            : assignedToMe
              ? "mine"
              : "other";

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
 * Live notification feed for the signed-in social worker: every non-resolved
 * conversation awaiting a reply, ranked urgent → mine → others. One query,
 * partitioned into tiers client-side.
 */
export function useNotifications() {
    const { user } = useAuth();
    const uid = user?.uid ?? "";

    const [rawItems, setRawItems] = useState<NotificationItem[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!uid) {
            setRawItems([]);
            setLoaded(false);
            return;
        }

        setLoaded(false);

        const awaitingQuery = query(
            collection(db, "users"),
            where("role", "==", "patient"),
            where("awaitingReply", "==", true),
            where("status", "in", OPEN_STATUSES),
            orderBy("lastContactTimestamp", "desc")
        );

        const unsubscribe = onSnapshot(
            awaitingQuery,
            (snap) => {
                setRawItems(snap.docs.map((d) => toItem(d, uid)));
                setLoaded(true);
            },
            (error) => {
                console.error("Notifications query failed:", error);
                setRawItems([]);
                setLoaded(true);
            }
        );

        return unsubscribe;
    }, [uid]);

    const items = useMemo(() => {
        return [...rawItems].sort((a, b) => {
            const rank = TIER_RANK[a.tier] - TIER_RANK[b.tier];
            return rank !== 0 ? rank : b.sortTime - a.sortTime;
        });
    }, [rawItems]);

    // Badge color reflects the most severe tier present.
    const badgeColor: "red" | "yellow" | "gray" = items.some(
        (i) => i.tier === "urgent-mine" || i.tier === "urgent"
    )
        ? "red"
        : items.some((i) => i.tier === "mine")
          ? "yellow"
          : "gray";

    return {
        items,
        // True until the query has returned; the panel shows "Checking for
        // alerts…" during this window.
        loading: !loaded,
        badgeColor,
    };
}
