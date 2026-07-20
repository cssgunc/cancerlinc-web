import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ChevronDown,
    ImagePlus,
    Send,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { useParams } from "react-router";
import ReferralCard from "~/components/ReferralCard";
import ReferralFormDialog from "~/components/ReferralFormDialog";
import {
    useReferrals,
    addReferral,
    editReferral,
    deleteReferral,
    type ReferralFormData,
} from "~/hooks/useReferrals";
import type { ReferralWithProvider } from "~/types/referral";
import {
    collection,
    type DocumentData,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    type QueryDocumentSnapshot,
    query,
    startAfter,
    Timestamp,
    updateDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "~/services/firebase_app";
import {
    CHAT_ATTACHMENT_SETTINGS,
    formatMaxImageSizeLabel,
} from "~/services/chat_settings";
import {
    ChatAttachmentValidationError,
    sendChatMessageWithOptionalImage,
    validateChatImageFile,
} from "~/services/chat_attachment_service";
import { useAuth } from "~/services/firebase_provider";
import {
    normalizeStatus,
    PATIENT_STATUSES,
    statusLabel,
    type PatientStatus,
} from "~/types/status";

type ChatMessage = {
    id: string;
    senderId: string;
    senderName: string;
    direction: "sent" | "received";
    messageType: "text" | "image";
    text: string;
    imageUrl?: string;
    clientBatchId?: string;
    clientOrder: number;
    sortTimestamp: number;
    timestamp: string;
    isRead: boolean;
};

type UserProfile = {
    uid: string;
    email?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    role?: "patient" | "social_worker" | "admin";
    status?: PatientStatus;
    assignedSocialWorkerId?: string;
    assignedSocialWorkerName?: string;
    isVerified?: boolean;
    isBanned?: boolean;
};

type SocialWorkerOption = {
    id: string;
    name: string;
};

const PAGE_SIZE = 20;
const EASTERN_TIME_ZONE = "America/New_York";

function formatPersonName(profile?: Partial<UserProfile> | null) {
    if (!profile) return "";
    return (
        `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim() ||
        profile.username ||
        profile.email ||
        profile.uid ||
        ""
    );
}

function formatMessageDateTime(timestamp?: Timestamp) {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const datePart = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: EASTERN_TIME_ZONE,
    });
    const timePart = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: EASTERN_TIME_ZONE,
        timeZoneName: "short",
    });
    return `${datePart} · ${timePart}`;
}

export default function MemberPage() {
    const params = useParams();
    const { user } = useAuth();
    const userId = params.user ? decodeURIComponent(params.user) : "";
    const [chatUserProfile, setChatUserProfile] = useState<UserProfile | null>(
        null
    );
    const [currentUserProfile, setCurrentUserProfile] =
        useState<UserProfile | null>(null);
    const [controlsOpen, setControlsOpen] = useState(false);
    const [currentUserName, setCurrentUserName] = useState<string>("");
    const [socialWorkers, setSocialWorkers] = useState<SocialWorkerOption[]>(
        []
    );
    const [selectedSocialWorkerId, setSelectedSocialWorkerId] = useState("");
    const [selectedStatus, setSelectedStatus] =
        useState<PatientStatus>("closed");
    const [isSavingAssignment, setIsSavingAssignment] = useState(false);
    const [isSavingStatus, setIsSavingStatus] = useState(false);
    const [isSavingVerification, setIsSavingVerification] = useState(false);
    const [memberActionError, setMemberActionError] = useState("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState("");
    const [composerError, setComposerError] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    const [hasMoreMessages, setHasMoreMessages] = useState(true);
    const [senderProfiles, setSenderProfiles] = useState<
        Record<string, string>
    >({});
    const [editingReferral, setEditingReferral] =
        useState<ReferralWithProvider | null>(null);
    const [referralDialogMode, setReferralDialogMode] = useState<
        "add" | "edit" | null
    >(null);
    const { referrals } = useReferrals(userId);
    const messageContainerRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const oldestCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(
        null
    );
    const fetchedSenderIdsRef = useRef<Set<string>>(new Set());
    const initializedWorkerRef = useRef(false);

    const chatId = useMemo(() => {
        return userId ?? "";
    }, [userId]);

    // Live-subscribe to the patient doc so the displayed status (and assignment)
    // always reflects the DB — including status changes made by Cloud Functions
    // when a new message arrives.
    useEffect(() => {
        if (!userId) {
            setChatUserProfile(null);
            return;
        }

        initializedWorkerRef.current = false;

        const unsubscribe = onSnapshot(
            doc(db, "users", userId),
            (snapshot) => {
                if (!snapshot.exists()) {
                    setChatUserProfile(null);
                    return;
                }

                const data = snapshot.data() as Omit<UserProfile, "uid">;
                setChatUserProfile({ uid: snapshot.id, ...data });
                setSelectedStatus(normalizeStatus(data.status));

                // Only seed the dropdown on first load so live updates don't
                // clobber an in-progress selection the user hasn't assigned yet.
                if (!initializedWorkerRef.current) {
                    setSelectedSocialWorkerId(
                        data.assignedSocialWorkerId ?? user?.uid ?? ""
                    );
                    initializedWorkerRef.current = true;
                }
            },
            () => {
                setChatUserProfile(null);
            }
        );

        return unsubscribe;
    }, [user?.uid, userId]);

    useEffect(() => {
        if (!user?.uid) return;

        let isActive = true;

        async function loadCurrentUserProfile() {
            const snapshot = await getDoc(doc(db, "users", user!.uid));
            if (!isActive || !snapshot.exists()) return;

            const d = snapshot.data() as Omit<UserProfile, "uid">;
            const profile = { uid: snapshot.id, ...d };
            const name = formatPersonName(profile);
            setCurrentUserProfile(profile);
            setCurrentUserName(name);
        }

        loadCurrentUserProfile().catch(() => {});

        return () => {
            isActive = false;
        };
    }, [user?.uid]);

    useEffect(() => {
        let isActive = true;

        async function loadSocialWorkers() {
            const snapshot = await getDocs(
                query(
                    collection(db, "users"),
                    where("role", "in", ["social_worker", "admin"]),
                    limit(100)
                )
            );
            if (!isActive) return;

            const options = snapshot.docs
                .map((workerDoc) => {
                    const data = workerDoc.data() as Omit<UserProfile, "uid">;
                    return {
                        id: workerDoc.id,
                        name: formatPersonName({
                            uid: workerDoc.id,
                            ...data,
                        }),
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            setSocialWorkers(options);
        }

        loadSocialWorkers().catch(() => {
            if (isActive) setSocialWorkers([]);
        });

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        if (!chatUserProfile?.assignedSocialWorkerId && user?.uid) {
            setSelectedSocialWorkerId(user.uid);
        }
    }, [chatUserProfile?.assignedSocialWorkerId, user?.uid]);

    const mapMessageDoc = useCallback(
        (messageDoc: QueryDocumentSnapshot<DocumentData>): ChatMessage => {
            const data = messageDoc.data() as {
                senderId?: string;
                senderName?: string;
                content?: string;
                messageType?: "text" | "image";
                imageUrl?: string;
                clientBatchId?: string;
                clientOrder?: number;
                timestamp?: Timestamp;
                isRead?: boolean;
            };

            return {
                id: messageDoc.id,
                senderId: data.senderId ?? "",
                senderName: data.senderName ?? "",
                direction: data.senderId === user?.uid ? "sent" : "received",
                messageType: data.messageType ?? "text",
                text: data.content ?? "",
                imageUrl: data.imageUrl,
                clientBatchId: data.clientBatchId,
                clientOrder: data.clientOrder ?? 0,
                sortTimestamp: data.timestamp?.toMillis() ?? 0,
                timestamp: formatMessageDateTime(data.timestamp),
                isRead: data.isRead ?? false,
            };
        },
        [user?.uid]
    );

    const loadSenderProfiles = useCallback(
        async (msgs: ChatMessage[]) => {
            const unknownIds = [
                ...new Set(
                    msgs
                        .map((m) => m.senderId)
                        .filter(
                            (id) =>
                                id &&
                                id !== user?.uid &&
                                id !== userId &&
                                !fetchedSenderIdsRef.current.has(id)
                        )
                ),
            ];
            if (!unknownIds.length) return;

            unknownIds.forEach((id) => fetchedSenderIdsRef.current.add(id));

            const fetched: Record<string, string> = {};
            await Promise.all(
                unknownIds.map(async (id) => {
                    try {
                        const snap = await getDoc(doc(db, "users", id));
                        if (snap.exists()) {
                            const d = snap.data() as Omit<UserProfile, "uid">;
                            const name =
                                `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() ||
                                d.username ||
                                d.email ||
                                id;
                            fetched[id] = name ?? id;
                        } else {
                            fetched[id] = id;
                        }
                    } catch {
                        fetched[id] = id;
                    }
                })
            );
            setSenderProfiles((prev) => ({ ...prev, ...fetched }));
        },
        [user?.uid, userId]
    );

    const sortMessagesAscending = useCallback((items: ChatMessage[]) => {
        return [...items].sort((a, b) => {
            if (a.sortTimestamp !== b.sortTimestamp) {
                return a.sortTimestamp - b.sortTimestamp;
            }

            if ((a.clientBatchId ?? "") !== (b.clientBatchId ?? "")) {
                return (a.clientBatchId ?? "").localeCompare(
                    b.clientBatchId ?? ""
                );
            }

            return a.clientOrder - b.clientOrder;
        });
    }, []);

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            const container = messageContainerRef.current;
            if (!container) return;
            container.scrollTop = container.scrollHeight;
        });
    }, []);

    const markReceivedMessagesRead = useCallback(
        (docs: QueryDocumentSnapshot<DocumentData>[]) => {
            if (!user?.uid) return;
            const unread = docs.filter((d) => {
                const data = d.data();
                return data.isRead === false && data.senderId !== user.uid;
            });
            if (!unread.length) return;
            const batch = writeBatch(db);
            unread.forEach((d) => batch.update(d.ref, { isRead: true }));
            void batch.commit();
        },
        [user?.uid]
    );

    const loadOlderMessages = useCallback(async () => {
        if (
            !chatId ||
            !oldestCursorRef.current ||
            isLoadingOlder ||
            !hasMoreMessages
        ) {
            return;
        }

        const container = messageContainerRef.current;
        const previousScrollHeight = container?.scrollHeight ?? 0;
        const previousScrollTop = container?.scrollTop ?? 0;

        setIsLoadingOlder(true);

        try {
            const messagesRef = collection(db, "chats", chatId, "messages");
            const olderQuery = query(
                messagesRef,
                orderBy("timestamp", "desc"),
                startAfter(oldestCursorRef.current),
                limit(PAGE_SIZE)
            );
            const snapshot = await getDocs(olderQuery);

            if (!snapshot.docs.length) {
                setHasMoreMessages(false);
                return;
            }

            oldestCursorRef.current = snapshot.docs.at(-1) ?? null;
            setHasMoreMessages(snapshot.docs.length === PAGE_SIZE);

            const olderMessages = sortMessagesAscending(
                snapshot.docs.map(mapMessageDoc)
            );
            void loadSenderProfiles(olderMessages);
            markReceivedMessagesRead(snapshot.docs);
            setMessages((current) =>
                sortMessagesAscending([...olderMessages, ...current])
            );

            requestAnimationFrame(() => {
                const nextContainer = messageContainerRef.current;
                if (!nextContainer) return;

                const newScrollHeight = nextContainer.scrollHeight;
                nextContainer.scrollTop =
                    newScrollHeight - previousScrollHeight + previousScrollTop;
            });
        } finally {
            setIsLoadingOlder(false);
        }
    }, [
        chatId,
        hasMoreMessages,
        isLoadingOlder,
        loadSenderProfiles,
        mapMessageDoc,
        markReceivedMessagesRead,
        sortMessagesAscending,
    ]);

    useEffect(() => {
        if (!chatId) {
            setMessages([]);
            setHasMoreMessages(false);
            oldestCursorRef.current = null;
            return;
        }

        setIsLoadingMessages(true);
        fetchedSenderIdsRef.current = new Set();

        const messagesRef = collection(db, "chats", chatId, "messages");
        const liveQuery = query(
            messagesRef,
            orderBy("timestamp", "desc"),
            limit(PAGE_SIZE)
        );

        const unsubscribe = onSnapshot(liveQuery, (snapshot) => {
            const mapped = sortMessagesAscending(
                snapshot.docs.map(mapMessageDoc)
            );
            oldestCursorRef.current = snapshot.docs.at(-1) ?? null;
            setHasMoreMessages(snapshot.docs.length === PAGE_SIZE);
            setMessages(mapped);
            setIsLoadingMessages(false);
            scrollToBottom();
            void loadSenderProfiles(mapped);
            markReceivedMessagesRead(snapshot.docs);
        });

        return unsubscribe;
    }, [
        chatId,
        loadSenderProfiles,
        mapMessageDoc,
        markReceivedMessagesRead,
        scrollToBottom,
        sortMessagesAscending,
    ]);

    const chatUserFullName = useMemo(() => {
        if (!chatUserProfile) return "Unknown User";

        const fullName =
            `${chatUserProfile.firstName ?? ""} ${chatUserProfile.lastName ?? ""}`.trim();

        return fullName || "Unknown User";
    }, [chatUserProfile]);

    const chatUserFirstName = useMemo(() => {
        if (!chatUserProfile?.firstName?.trim()) return "User";
        return chatUserProfile.firstName.trim();
    }, [chatUserProfile]);

    useEffect(() => {
        if (!selectedImage) {
            setSelectedImagePreviewUrl("");
            return;
        }

        const objectUrl = URL.createObjectURL(selectedImage);
        setSelectedImagePreviewUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [selectedImage]);

    function clearSelectedImage() {
        setSelectedImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    async function sendMessage() {
        if (!user?.uid || !userId || !chatId || isSending) return;

        setComposerError("");
        setIsSending(true);

        try {
            await sendChatMessageWithOptionalImage({
                chatId,
                senderId: user.uid,
                senderName:
                    currentUserName || user.displayName || user.email || "",
                text: newMessage,
                imageFile: selectedImage,
            });
            setNewMessage("");
            clearSelectedImage();
        } catch (error) {
            if (error instanceof ChatAttachmentValidationError) {
                setComposerError(error.message);
            } else {
                setComposerError(
                    "Unable to send the message right now. Please try again."
                );
            }
            return;
        } finally {
            setIsSending(false);
        }
    }

    function handleSelectImage() {
        fileInputRef.current?.click();
    }

    function handleImageInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setComposerError("");

        try {
            validateChatImageFile(file);
            setSelectedImage(file);
        } catch (error) {
            clearSelectedImage();
            if (error instanceof ChatAttachmentValidationError) {
                setComposerError(error.message);
                return;
            }

            setComposerError("Unable to attach that image.");
        }
    }

    function handleMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
        if (e.currentTarget.scrollTop <= 80) {
            void loadOlderMessages();
        }
    }

    async function handleAssignSocialWorker() {
        if (!userId || !selectedSocialWorkerId) return;

        const selectedWorker =
            socialWorkers.find(
                (worker) => worker.id === selectedSocialWorkerId
            ) ??
            (selectedSocialWorkerId === currentUserProfile?.uid
                ? {
                      id: currentUserProfile.uid,
                      name: formatPersonName(currentUserProfile),
                  }
                : null);

        if (!selectedWorker) {
            setMemberActionError("Select a social worker before assigning.");
            return;
        }

        setMemberActionError("");
        setIsSavingAssignment(true);

        try {
            await updateDoc(doc(db, "users", userId), {
                assignedSocialWorkerId: selectedWorker.id,
                assignedSocialWorkerName: selectedWorker.name,
            });
            setChatUserProfile((current) =>
                current
                    ? {
                          ...current,
                          assignedSocialWorkerId: selectedWorker.id,
                          assignedSocialWorkerName: selectedWorker.name,
                      }
                    : current
            );
        } catch {
            setMemberActionError(
                "Unable to assign the social worker right now. Please try again."
            );
        } finally {
            setIsSavingAssignment(false);
        }
    }

    async function handleStatusChange(nextStatus: PatientStatus) {
        if (!userId || nextStatus === selectedStatus) return;

        const previousStatus = selectedStatus;
        setMemberActionError("");
        setSelectedStatus(nextStatus);
        setIsSavingStatus(true);

        try {
            await updateDoc(doc(db, "users", userId), {
                status: nextStatus,
            });
            setChatUserProfile((current) =>
                current ? { ...current, status: nextStatus } : current
            );
        } catch {
            setSelectedStatus(previousStatus);
            setMemberActionError(
                "Unable to update the patient status right now. Please try again."
            );
        } finally {
            setIsSavingStatus(false);
        }
    }

    async function handleVerify() {
        if (!userId) return;

        const previousIsVerified = chatUserProfile?.isVerified;
        const previousIsBanned = chatUserProfile?.isBanned;
        setMemberActionError("");
        setChatUserProfile((current) =>
            current
                ? { ...current, isVerified: true, isBanned: false }
                : current
        );
        setIsSavingVerification(true);

        try {
            await updateDoc(doc(db, "users", userId), {
                isVerified: true,
                isBanned: false,
                updatedAt: Timestamp.now(),
            });
        } catch {
            setChatUserProfile((current) =>
                current
                    ? {
                          ...current,
                          isVerified: previousIsVerified,
                          isBanned: previousIsBanned,
                      }
                    : current
            );
            setMemberActionError(
                "Unable to verify the patient right now. Please try again."
            );
        } finally {
            setIsSavingVerification(false);
        }
    }

    async function handleDeny() {
        if (!userId) return;

        const previousIsVerified = chatUserProfile?.isVerified;
        const previousIsBanned = chatUserProfile?.isBanned;
        setMemberActionError("");
        setChatUserProfile((current) =>
            current
                ? { ...current, isBanned: true, isVerified: false }
                : current
        );
        setIsSavingVerification(true);

        try {
            await updateDoc(doc(db, "users", userId), {
                isBanned: true,
                isVerified: false,
                updatedAt: Timestamp.now(),
            });
        } catch {
            setChatUserProfile((current) =>
                current
                    ? {
                          ...current,
                          isVerified: previousIsVerified,
                          isBanned: previousIsBanned,
                      }
                    : current
            );
            setMemberActionError(
                "Unable to deny the patient right now. Please try again."
            );
        } finally {
            setIsSavingVerification(false);
        }
    }

    return (
        <div
            className="flex h-full flex-col overflow-hidden px-4 pb-3 pt-5 text-black"
            style={{ fontFamily: "Inter, sans-serif" }}
        >
            <div className="mx-auto flex w-[84vw] max-w-[1400px] flex-1 flex-col min-h-0 pb-2">
                <section className="mb-5 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                    <button
                        type="button"
                        onClick={() => setControlsOpen((open) => !open)}
                        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#4B5563]">
                                <SlidersHorizontal size={18} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#666666]">
                                    Patient Controls
                                </p>
                                <p className="text-sm text-[#4B5563]">
                                    {chatUserProfile?.assignedSocialWorkerName ||
                                        "No social worker assigned"}{" "}
                                    · {statusLabel(selectedStatus)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {memberActionError ? (
                                <span className="text-sm text-[#B42318]">
                                    {memberActionError}
                                </span>
                            ) : null}
                            <ChevronDown
                                size={18}
                                className={`transition-transform ${
                                    controlsOpen ? "rotate-180" : ""
                                }`}
                            />
                        </div>
                    </button>

                    {controlsOpen ? (
                        <div className="border-t border-[#E5E7EB] px-5 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#666666]">
                                        Assigned Social Worker
                                    </span>
                                    <select
                                        value={selectedSocialWorkerId}
                                        onChange={(e) =>
                                            setSelectedSocialWorkerId(
                                                e.target.value
                                            )
                                        }
                                        className="min-w-[220px] rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-green-600"
                                        disabled={isSavingAssignment}
                                    >
                                        <option value="">
                                            Select social worker
                                        </option>
                                        {currentUserProfile?.uid &&
                                        !socialWorkers.some(
                                            (worker) =>
                                                worker.id ===
                                                currentUserProfile.uid
                                        ) ? (
                                            <option
                                                value={currentUserProfile.uid}
                                            >
                                                {formatPersonName(
                                                    currentUserProfile
                                                ) || "Current user"}
                                            </option>
                                        ) : null}
                                        {socialWorkers.map((worker) => (
                                            <option
                                                key={worker.id}
                                                value={worker.id}
                                            >
                                                {worker.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void handleAssignSocialWorker()
                                        }
                                        disabled={
                                            isSavingAssignment ||
                                            !selectedSocialWorkerId ||
                                            selectedSocialWorkerId ===
                                                chatUserProfile?.assignedSocialWorkerId
                                        }
                                        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isSavingAssignment
                                            ? "Saving..."
                                            : selectedSocialWorkerId ===
                                                chatUserProfile?.assignedSocialWorkerId
                                              ? "Assigned"
                                              : "Assign"}
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#666666]">
                                        Patient Status
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {PATIENT_STATUSES.map((status) => {
                                            const isActiveStatus =
                                                selectedStatus === status;
                                            return (
                                                <button
                                                    key={status}
                                                    type="button"
                                                    onClick={() =>
                                                        void handleStatusChange(
                                                            status
                                                        )
                                                    }
                                                    disabled={isSavingStatus}
                                                    className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors ${
                                                        isActiveStatus
                                                            ? "bg-black text-white"
                                                            : "bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB]"
                                                    } disabled:cursor-not-allowed disabled:opacity-60`}
                                                >
                                                    {statusLabel(status)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#666666]">
                                        Verification
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {/* Current state pill */}
                                        <span className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white">
                                            {chatUserProfile?.isBanned
                                                ? "Denied"
                                                : chatUserProfile?.isVerified
                                                  ? "Verified"
                                                  : "Unverified"}
                                        </span>
                                        {/* Verify action — hidden when already verified and not banned */}
                                        {!chatUserProfile?.isVerified ||
                                        chatUserProfile?.isBanned ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleVerify()
                                                }
                                                disabled={isSavingVerification}
                                                className="rounded-full bg-[#F3F4F6] px-4 py-2 text-sm font-medium text-[#4B5563] capitalize transition-colors hover:bg-[#E5E7EB] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                Verify
                                            </button>
                                        ) : null}
                                        {/* Deny action — hidden when already banned */}
                                        {!chatUserProfile?.isBanned ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void handleDeny()
                                                }
                                                disabled={isSavingVerification}
                                                className="rounded-full bg-[#F3F4F6] px-4 py-2 text-sm font-medium text-[#4B5563] capitalize transition-colors hover:bg-[#E5E7EB] disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                Deny
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </section>

                <div className="flex flex-1 items-stretch justify-center gap-6 min-h-0">
                    {/* Referrals column */}
                    <div className="flex w-[25vw] min-w-[260px] flex-col">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-[24px] font-semibold leading-tight text-black">
                                {chatUserFirstName}&apos;s Referrals
                            </h2>
                            <button
                                className="shrink-0 whitespace-nowrap text-sm font-medium text-gray-500 underline transition-colors hover:text-black"
                                onClick={() => {
                                    setEditingReferral(null);
                                    setReferralDialogMode("add");
                                }}
                            >
                                + Add
                            </button>
                        </div>

                        <section className="flex flex-1 flex-col overflow-hidden bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                                {referrals.length === 0 ? (
                                    <p className="text-sm text-gray-500">
                                        No referrals found.
                                    </p>
                                ) : (
                                    referrals.map((referral) => (
                                        <ReferralCard
                                            key={referral.id}
                                            referral={referral}
                                            onEdit={() => {
                                                setEditingReferral(referral);
                                                setReferralDialogMode("edit");
                                            }}
                                            onDelete={(id) =>
                                                void deleteReferral(userId, id)
                                            }
                                        />
                                    ))
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Chat column */}
                    <div className="flex w-[50vw] min-w-[360px] max-w-[600px] flex-col">
                        <h2 className="mb-3 text-right text-[24px] font-semibold leading-tight text-black">
                            Chat with {chatUserFullName}
                        </h2>

                        <section className="flex flex-1 flex-col overflow-hidden bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
                            <div
                                ref={messageContainerRef}
                                onScroll={handleMessagesScroll}
                                className="flex-1 overflow-y-auto pr-1"
                            >
                                {isLoadingOlder ? (
                                    <p className="pb-3 text-center text-sm text-[#999999]">
                                        Loading older messages...
                                    </p>
                                ) : null}

                                {!isLoadingMessages && messages.length === 0 ? (
                                    <div className="flex h-full items-center justify-center">
                                        <p className="text-sm text-[#999999]">
                                            No messages yet!
                                        </p>
                                    </div>
                                ) : null}

                                <div className="pb-6">
                                    {isLoadingMessages ? (
                                        <p className="text-center text-sm text-[#999999]">
                                            Loading messages...
                                        </p>
                                    ) : null}

                                    {messages.map((message, index) => {
                                        const isSent =
                                            message.direction === "sent";
                                        const isPatient =
                                            message.senderId === userId;
                                        const nextMessage = messages[index + 1];
                                        const previousMessage =
                                            messages[index - 1];
                                        const startsChunk =
                                            !previousMessage ||
                                            previousMessage.senderId !==
                                                message.senderId;
                                        const endsChunk =
                                            !nextMessage ||
                                            nextMessage.senderId !==
                                                message.senderId;
                                        const senderLabel = isSent
                                            ? currentUserName ||
                                              message.senderName ||
                                              "You"
                                            : isPatient
                                              ? chatUserFullName
                                              : message.senderName ||
                                                senderProfiles[
                                                    message.senderId
                                                ] ||
                                                message.senderId ||
                                                "Unknown";

                                        return (
                                            <div
                                                key={message.id}
                                                className={`flex ${isSent ? "justify-end" : "justify-start"} ${startsChunk ? "pt-4" : "pt-0.5"}`}
                                            >
                                                <div
                                                    className={`max-w-[75%] ${isSent ? "items-end" : "items-start"} flex flex-col`}
                                                >
                                                    {startsChunk &&
                                                    senderLabel ? (
                                                        <span className="mb-1 text-xs font-medium text-[#666666]">
                                                            {senderLabel}
                                                        </span>
                                                    ) : null}
                                                    <div
                                                        className={`rounded-2xl px-4 py-3 text-[16px] ${isSent ? "bg-black text-white" : "bg-[#F0F0F0] text-black"}`}
                                                    >
                                                        {message.messageType ===
                                                        "image" ? (
                                                            message.imageUrl ? (
                                                                <img
                                                                    src={
                                                                        message.imageUrl
                                                                    }
                                                                    alt="Chat attachment"
                                                                    className="max-h-72 rounded-xl object-cover"
                                                                />
                                                            ) : (
                                                                <span>
                                                                    Image
                                                                    unavailable
                                                                </span>
                                                            )
                                                        ) : (
                                                            message.text
                                                        )}
                                                    </div>
                                                    {endsChunk ? (
                                                        <span
                                                            className={`mt-1 text-[16px] text-[#999999] ${isSent ? "text-right" : "text-left"}`}
                                                        >
                                                            {message.timestamp}
                                                        </span>
                                                    ) : null}
                                                    {endsChunk &&
                                                    isSent &&
                                                    message.isRead ? (
                                                        <span className="mt-0.5 text-xs text-[#999999] self-end">
                                                            Read
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-auto">
                                <div className="h-px w-full bg-[#D9D9D9]" />

                                {selectedImage ? (
                                    <div className="mt-4 rounded-2xl border border-[#D9D9D9] bg-[#FAFAFA] p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-black">
                                                    Image ready to send
                                                </p>
                                                <p className="text-xs text-[#666666]">
                                                    {selectedImage.name}
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                className="flex h-8 w-8 items-center justify-center rounded-md border border-[#D9D9D9] bg-white text-black"
                                                aria-label="Remove selected image"
                                                onClick={clearSelectedImage}
                                                disabled={isSending}
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>

                                        {selectedImagePreviewUrl ? (
                                            <img
                                                src={selectedImagePreviewUrl}
                                                alt="Selected attachment preview"
                                                className="mt-3 max-h-56 rounded-xl object-cover"
                                            />
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="mt-4 flex items-center gap-3">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={CHAT_ATTACHMENT_SETTINGS.acceptedMimeTypes.join(
                                            ","
                                        )}
                                        className="hidden"
                                        onChange={handleImageInputChange}
                                    />

                                    <input
                                        type="text"
                                        placeholder="Type message..."
                                        value={newMessage}
                                        onChange={(e) =>
                                            setNewMessage(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                void sendMessage();
                                            }
                                        }}
                                        className="h-12 flex-1 rounded-2xl border-0 bg-[#F0F0F0] px-4 text-base text-black placeholder:italic placeholder:text-[#999999] focus:outline-none"
                                    />

                                    <button
                                        type="button"
                                        className="flex h-12 w-12 items-center justify-center rounded-md bg-black text-white"
                                        aria-label="Add photo"
                                        onClick={handleSelectImage}
                                        disabled={isSending}
                                    >
                                        <ImagePlus size={22} />
                                    </button>

                                    <button
                                        type="button"
                                        className="flex h-12 w-12 items-center justify-center rounded-md bg-black text-white"
                                        aria-label="Send message"
                                        onClick={() => void sendMessage()}
                                        disabled={
                                            isSending ||
                                            (!newMessage.trim() &&
                                                !selectedImage)
                                        }
                                    >
                                        <Send size={22} />
                                    </button>
                                </div>

                                <div className="mt-3 flex items-center justify-between gap-4 text-xs text-[#666666]">
                                    <p>
                                        One image per message. Max{" "}
                                        {formatMaxImageSizeLabel()}. Allowed:{" "}
                                        {
                                            CHAT_ATTACHMENT_SETTINGS.acceptedFileExtensionsLabel
                                        }
                                    </p>
                                    {composerError ? (
                                        <p className="text-right text-[#B42318]">
                                            {composerError}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            <ReferralFormDialog
                open={referralDialogMode !== null}
                onClose={() => {
                    setReferralDialogMode(null);
                    setEditingReferral(null);
                }}
                onSubmit={async (data: ReferralFormData) => {
                    if (referralDialogMode === "edit" && editingReferral) {
                        await editReferral(userId, editingReferral.id, data);
                    } else {
                        await addReferral(userId, data);
                    }
                    setReferralDialogMode(null);
                    setEditingReferral(null);
                }}
                initialData={
                    referralDialogMode === "edit" ? editingReferral : null
                }
                title={
                    referralDialogMode === "edit"
                        ? "Edit Referral"
                        : "Add Referral"
                }
                patientId={userId}
                socialWorkerId={user?.uid ?? ""}
            />
        </div>
    );
}
