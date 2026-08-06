import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
    collection,
    doc,
    getCountFromServer,
    getDocs,
    type DocumentSnapshot,
    limit,
    orderBy,
    query,
    startAfter,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { db } from "~/services/firebase_app";

// --- Types ---
type UnverifiedPatient = {
    id: string;
    name: string;
    email: string;
    isBanned: boolean;
    isVerified: boolean;
};

type PatientCategory = "verified" | "unverified" | "rejected";

function getCategory(p: UnverifiedPatient): PatientCategory {
    if (p.isBanned) return "rejected";
    if (p.isVerified) return "verified";
    return "unverified";
}

// --- Search helpers (prefix-range search for Firestore) ---
// Mirrors the same helpers in _index.tsx; reuses existing indexes (role, lastNameLower) and (role, firstName)
function prefixRange(s: string): [string, string] {
    const lower = s.toLowerCase();
    const upper =
        lower.slice(0, -1) +
        String.fromCharCode(lower.charCodeAt(lower.length - 1) + 1);
    return [lower, upper];
}

function prefixRangeExactCase(s: string): [string, string] {
    const upper =
        s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + 1);
    return [s, upper];
}

function firstNameQueryVariants(value: string): string[] {
    const titleCase = value.charAt(0).toUpperCase() + value.slice(1);
    return [...new Set([value, titleCase])].filter(Boolean);
}

// --- View state ---
// The status filters + page size are NOT persisted globally. They are only
// "remembered" for the single round-trip: verification table → View Profile →
// Back. That snapshot rides ephemeral router navigation state (see goToProfile
// and the Back button in app_layout) and vanishes as soon as you navigate
// anywhere else, so a fresh visit always starts from defaults.
type StatusChecks = {
    verified: boolean;
    unverified: boolean;
    rejected: boolean;
};

const DEFAULT_STATUS_CHECKS: StatusChecks = {
    verified: false,
    unverified: true,
    rejected: false,
};

type ViewSnapshot = {
    statusChecks?: StatusChecks;
    pageSize?: number;
};

// --- Component ---
export default function UnverifiedPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();

    const [patients, setPatients] = useState<UnverifiedPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    // Restore filters/page size only when arriving back from a profile that was
    // opened from this page (router state carries the snapshot for that one hop).
    const restoredView = (location.state as { view?: ViewSnapshot } | null)
        ?.view;
    const [statusChecks, setStatusChecks] = useState<StatusChecks>(
        () => restoredView?.statusChecks ?? DEFAULT_STATUS_CHECKS
    );
    const [pageSize, setPageSize] = useState(
        () => restoredView?.pageSize ?? 25
    );
    const [pendingCount, setPendingCount] = useState<number | null>(null);
    const [totalPatients, setTotalPatients] = useState<number | null>(null);
    const [verifiedCount, setVerifiedCount] = useState<number | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // Pagination cursors: stack of "last doc of each page" so we can go back
    const cursorStack = useRef<DocumentSnapshot[]>([]);
    const [page, setPage] = useState(0); // 0-indexed current page
    const [hasNextPage, setHasNextPage] = useState(false);

    // Search value comes from the URL (?q=) — written by the shared TopBar in app_layout
    const q = searchParams.get("q") ?? "";
    const [debouncedQuery, setDebouncedQuery] = useState(() =>
        q.trim().toLowerCase()
    );

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(q.trim().toLowerCase());
        }, 300);
        return () => clearTimeout(timer);
    }, [q]);

    // When ONLY "Verified" is checked, narrow the query server-side to
    // role==patient & isVerified==true — the exact same query the main dashboard
    // runs — so the two tables return identical results.
    const onlyVerified =
        statusChecks.verified &&
        !statusChecks.unverified &&
        !statusChecks.rejected;
    // When ONLY "Unverified" is checked (the default view), narrow the query
    // server-side to isVerified==false using the same composite index.
    const onlyUnverified =
        statusChecks.unverified &&
        !statusChecks.verified &&
        !statusChecks.rejected;

    // Reset to page 0 whenever the query or the status filter changes
    useEffect(() => {
        cursorStack.current = [];
        setPage(0);
    }, [
        debouncedQuery,
        statusChecks.verified,
        statusChecks.unverified,
        statusChecks.rejected,
    ]);

    // Fetch counts once on mount
    useEffect(() => {
        const usersRef = collection(db, "users");
        Promise.all([
            getCountFromServer(
                query(
                    usersRef,
                    where("role", "==", "patient"),
                    where("isVerified", "==", false)
                )
            ),
            getCountFromServer(query(usersRef, where("role", "==", "patient"))),
            getCountFromServer(
                query(
                    usersRef,
                    where("role", "==", "patient"),
                    where("isVerified", "==", true)
                )
            ),
        ])
            .then(([pending, total, verified]) => {
                setPendingCount(pending.data().count);
                setTotalPatients(total.data().count);
                setVerifiedCount(verified.data().count);
            })
            .catch(() => {
                // Non-critical — count badges stay blank
            });
    }, []);

    // Fetch patients whenever page, debouncedQuery, or pageSize changes
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        async function fetchPatients() {
            try {
                const usersRef = collection(db, "users");

                if (debouncedQuery.length > 0) {
                    // --- Server-side search mode ---
                    // Uses existing indexes: (role, lastNameLower) and (role, firstName)
                    // No isVerified/isBanned filter — this page intentionally shows all categories
                    const [lo, hi] = prefixRange(debouncedQuery);
                    const patientQueries = [
                        getDocs(
                            query(
                                usersRef,
                                where("role", "==", "patient"),
                                where("lastNameLower", ">=", lo),
                                where("lastNameLower", "<", hi),
                                orderBy("lastNameLower"),
                                limit(pageSize)
                            )
                        ),
                    ];

                    for (const variant of firstNameQueryVariants(
                        debouncedQuery
                    )) {
                        const [firstLo, firstHi] =
                            prefixRangeExactCase(variant);
                        patientQueries.push(
                            getDocs(
                                query(
                                    usersRef,
                                    where("role", "==", "patient"),
                                    where("firstName", ">=", firstLo),
                                    where("firstName", "<", firstHi),
                                    orderBy("firstName"),
                                    limit(pageSize)
                                )
                            )
                        );
                    }

                    const patientSnaps = await Promise.all(patientQueries);
                    if (cancelled) return;

                    // Merge and deduplicate by id
                    const seen = new Set<string>();
                    const merged = patientSnaps
                        .flatMap((snap) => snap.docs)
                        .filter((d) => {
                            if (seen.has(d.id)) return false;
                            seen.add(d.id);
                            return true;
                        })
                        .sort((a, b) => {
                            const aLast = String(a.data().lastName ?? "");
                            const bLast = String(b.data().lastName ?? "");
                            return aLast.localeCompare(bLast);
                        });

                    const results: UnverifiedPatient[] = merged.map((d) => {
                        const data = d.data();
                        const email = (data.email as string) || "";
                        return {
                            id: d.id,
                            name:
                                `${(data.firstName as string) ?? ""} ${(data.lastName as string) ?? ""}`.trim() ||
                                email ||
                                d.id,
                            email,
                            isBanned: data.isBanned === true,
                            isVerified: data.isVerified === true,
                        };
                    });

                    setPatients(results);
                    setHasNextPage(false); // no cursor pagination while searching
                } else {
                    // --- Cursor-pagination mode ---
                    // Uses existing composite indexes: (role, lastName), or
                    // (role, isVerified, lastName) when filtering to a single
                    // verification status.
                    const baseConstraints: Parameters<typeof query>[1][] = [
                        where("role", "==", "patient"),
                    ];
                    if (onlyVerified) {
                        baseConstraints.push(where("isVerified", "==", true));
                    } else if (onlyUnverified) {
                        baseConstraints.push(where("isVerified", "==", false));
                    }
                    baseConstraints.push(orderBy("lastName"));

                    if (
                        !statusChecks.verified &&
                        !statusChecks.unverified &&
                        !statusChecks.rejected
                    ) {
                        // Nothing can match — skip the round trip entirely.
                        setPatients([]);
                        setHasNextPage(false);
                        return;
                    }

                    const toPatient = (
                        d: DocumentSnapshot
                    ): UnverifiedPatient => {
                        const data = d.data()!;
                        const email = (data.email as string) || "";
                        return {
                            id: d.id,
                            name:
                                `${(data.firstName as string) ?? ""} ${(data.lastName as string) ?? ""}`.trim() ||
                                email ||
                                d.id,
                            email,
                            isBanned: data.isBanned === true,
                            isVerified: data.isVerified === true,
                        };
                    };

                    // The active status filter is applied per-doc below, so a
                    // raw batch of `pageSize` docs may contain fewer (or zero)
                    // rows that actually match. Keep pulling subsequent raw
                    // batches — resuming exactly where the previous page left
                    // off — until this page has a full set of matches or the
                    // collection runs out.
                    let cursor: DocumentSnapshot | undefined =
                        page > 0 ? cursorStack.current[page - 1] : undefined;
                    const collected: UnverifiedPatient[] = [];

                    while (collected.length < pageSize) {
                        const batchConstraints = [
                            ...baseConstraints,
                            ...(cursor ? [startAfter(cursor)] : []),
                            limit(pageSize),
                        ];
                        const snap = await getDocs(
                            query(usersRef, ...batchConstraints)
                        );
                        if (cancelled) return;
                        if (snap.empty) break;

                        for (const d of snap.docs) {
                            cursor = d;
                            const candidate = toPatient(d);
                            if (statusChecks[getCategory(candidate)]) {
                                collected.push(candidate);
                                if (collected.length === pageSize) break;
                            }
                        }

                        if (snap.docs.length < pageSize) break;
                    }

                    let hasNext = false;
                    if (collected.length === pageSize && cursor) {
                        const probeSnap = await getDocs(
                            query(
                                usersRef,
                                ...baseConstraints,
                                startAfter(cursor),
                                limit(1)
                            )
                        );
                        if (cancelled) return;
                        hasNext = !probeSnap.empty;
                    }

                    if (
                        collected.length > 0 &&
                        cursorStack.current.length <= page &&
                        cursor
                    ) {
                        cursorStack.current[page] = cursor;
                    }

                    setPatients(collected);
                    setHasNextPage(hasNext);
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    setError("Failed to load patients. Please try again.");
                    console.error(e);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void fetchPatients();
        return () => {
            cancelled = true;
        };
    }, [
        page,
        debouncedQuery,
        pageSize,
        onlyVerified,
        onlyUnverified,
        statusChecks.verified,
        statusChecks.unverified,
        statusChecks.rejected,
    ]);

    // Client-side filter by status checkboxes. When the server query already
    // narrowed to verified-only (and we're not searching), show rows as-is so
    // the results match the main dashboard exactly.
    const visiblePatients = useMemo(() => {
        if (!debouncedQuery && onlyVerified) return patients;
        return patients.filter((p) => statusChecks[getCategory(p)]);
    }, [patients, statusChecks, debouncedQuery, onlyVerified]);

    // Pagination denominator tracks the active server-side filter.
    const paginationTotal = onlyVerified ? verifiedCount : totalPatients;

    // Navigate to a member profile, carrying the current URL as origin so the
    // Back button in app_layout returns here with filters/search intact.
    function goToProfile(id: string) {
        navigate(`/member/${encodeURIComponent(id)}`, {
            state: {
                from: location.pathname + location.search,
                view: { statusChecks, pageSize },
            },
        });
    }

    // Changing page size resets cursor-based pagination
    function handlePageSizeChange(newSize: number) {
        cursorStack.current = [];
        setPage(0);
        setPageSize(newSize);
    }

    async function handleAccept(id: string) {
        if (savingId) return;
        setSavingId(id);
        setActionError(null);

        const previousPatients = patients;
        const previousPending = pendingCount;

        // Optimistic update: mark as verified, decrement pending count
        setPatients((prev) =>
            prev.map((p) =>
                p.id === id ? { ...p, isVerified: true, isBanned: false } : p
            )
        );
        setPendingCount((prev) =>
            prev != null ? Math.max(0, prev - 1) : prev
        );

        try {
            await updateDoc(doc(db, "users", id), {
                isVerified: true,
                isBanned: false,
                updatedAt: Timestamp.now(),
            });
        } catch {
            // Revert on failure
            setPatients(previousPatients);
            setPendingCount(previousPending);
            setActionError(
                "Unable to verify the patient right now. Please try again."
            );
        } finally {
            setSavingId(null);
        }
    }

    async function handleReject(id: string) {
        if (savingId) return;
        setSavingId(id);
        setActionError(null);

        const previousPatients = patients;

        // Optimistic update: mark as banned (rejected)
        setPatients((prev) =>
            prev.map((p) => (p.id === id ? { ...p, isBanned: true } : p))
        );

        try {
            await updateDoc(doc(db, "users", id), {
                isBanned: true,
                isVerified: false,
                updatedAt: Timestamp.now(),
            });
        } catch {
            // Revert on failure
            setPatients(previousPatients);
            setActionError(
                "Unable to deny the patient right now. Please try again."
            );
        } finally {
            setSavingId(null);
        }
    }

    return (
        <main className="container mx-auto px-6 py-8">
            {/* Back button */}
            <button
                type="button"
                onClick={() => navigate("/")}
                className="mb-4 flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
                ← Back
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-gray-900">
                        Unverified Patients
                        {pendingCount != null ? (
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-0.5 text-sm font-medium text-amber-800">
                                {pendingCount} pending
                            </span>
                        ) : null}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">
                        Review patients awaiting verification. Approve or deny
                        access by viewing each patient&apos;s profile.
                    </p>
                </div>
            </div>

            {/* Action error */}
            {actionError ? (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {actionError}
                </p>
            ) : null}

            {/* Table */}
            <section className="relative mt-8">
                {/* Click-outside backdrop to dismiss the filter panel */}
                {filtersOpen ? (
                    <div
                        className="fixed inset-0 z-20"
                        onClick={() => setFiltersOpen(false)}
                    />
                ) : null}

                {/* Filter panel */}
                {filtersOpen ? (
                    <div className="absolute right-6 top-16 z-30 w-[min(92vw,360px)] rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-lg">
                        <div className="flex flex-col gap-3">
                            <span className="text-sm font-medium text-gray-700">
                                Verification Status
                            </span>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={statusChecks.unverified}
                                    onChange={(e) =>
                                        setStatusChecks((prev) => ({
                                            ...prev,
                                            unverified: e.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
                                />
                                Unverified
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={statusChecks.verified}
                                    onChange={(e) =>
                                        setStatusChecks((prev) => ({
                                            ...prev,
                                            verified: e.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
                                />
                                Verified
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={statusChecks.rejected}
                                    onChange={(e) =>
                                        setStatusChecks((prev) => ({
                                            ...prev,
                                            rejected: e.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-600"
                                />
                                Rejected
                            </label>
                            <button
                                type="button"
                                onClick={() =>
                                    setStatusChecks({
                                        verified: false,
                                        unverified: true,
                                        rejected: false,
                                    })
                                }
                                className="mt-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="table-fixed min-w-full divide-y divide-gray-200">
                            <thead className="select-none bg-gray-50 text-left text-sm text-gray-600">
                                <tr>
                                    <th className="w-1/3 px-6 py-4 font-medium">
                                        <div className="flex items-center gap-1.5">
                                            Patient Name
                                            <button
                                                type="button"
                                                aria-label="Search patients"
                                                onClick={() =>
                                                    document
                                                        .getElementById(
                                                            "topbar-search"
                                                        )
                                                        ?.focus()
                                                }
                                                className="text-gray-400 hover:text-gray-700"
                                            >
                                                <Search className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </th>
                                    <th className="w-1/3 px-6 py-4 font-medium">
                                        Verification Status
                                    </th>
                                    <th className="w-1/3 px-6 py-4 font-medium">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>Actions</span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setFiltersOpen(
                                                        (open) => !open
                                                    )
                                                }
                                                className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                                                aria-label="Open filters"
                                            >
                                                <SlidersHorizontal size={14} />
                                                <ChevronDown
                                                    size={14}
                                                    className={`transition-transform ${
                                                        filtersOpen
                                                            ? "rotate-180"
                                                            : ""
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {loading ? (
                                    <tr>
                                        <td
                                            colSpan={3}
                                            className="px-6 py-12 text-center text-gray-400"
                                        >
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                        </td>
                                    </tr>
                                ) : error ? (
                                    <tr>
                                        <td
                                            colSpan={3}
                                            className="px-6 py-10 text-center text-sm text-red-600"
                                        >
                                            {error}
                                        </td>
                                    </tr>
                                ) : visiblePatients.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={3}
                                            className="px-6 py-10 text-center text-sm text-gray-400"
                                        >
                                            No patients match the current
                                            filters.
                                        </td>
                                    </tr>
                                ) : (
                                    visiblePatients.map((p) => {
                                        const category = getCategory(p);
                                        return (
                                            <tr
                                                key={p.id}
                                                className="hover:bg-gray-50/60"
                                            >
                                                <td className="px-6 py-4 font-medium text-gray-900">
                                                    <button
                                                        onClick={() =>
                                                            goToProfile(p.id)
                                                        }
                                                        className="text-left hover:underline"
                                                    >
                                                        {p.name}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {category === "verified" ? (
                                                        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                                                            Verified
                                                        </span>
                                                    ) : category ===
                                                      "rejected" ? (
                                                        <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                                                            Denied
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                                                            Pending verification
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        {category ===
                                                        "unverified" ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        savingId ===
                                                                        p.id
                                                                    }
                                                                    onClick={() =>
                                                                        void handleAccept(
                                                                            p.id
                                                                        )
                                                                    }
                                                                    style={{
                                                                        backgroundColor:
                                                                            "#A1CD3A",
                                                                    }}
                                                                    className="rounded-xl px-4 py-2 text-sm font-medium text-white shadow hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                                                                >
                                                                    {savingId ===
                                                                    p.id
                                                                        ? "Saving…"
                                                                        : "Accept"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        savingId ===
                                                                        p.id
                                                                    }
                                                                    onClick={() =>
                                                                        void handleReject(
                                                                            p.id
                                                                        )
                                                                    }
                                                                    className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        ) : null}
                                                        {/* Muted "View Profile" button — greyer than Accept/Reject */}
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                goToProfile(
                                                                    p.id
                                                                )
                                                            }
                                                            className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                                                        >
                                                            View Profile
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination — hidden while searching since all results are shown on one page */}
                    {!loading &&
                    !error &&
                    !debouncedQuery &&
                    (paginationTotal ?? 0) > pageSize ? (
                        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 text-sm text-gray-600">
                            <div className="flex items-center gap-3">
                                <span>
                                    Showing {page * pageSize + 1}–
                                    {page * pageSize + patients.length}
                                    {paginationTotal != null
                                        ? ` of ${paginationTotal}`
                                        : ""}{" "}
                                    patients
                                </span>
                                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                                    <span className="text-gray-500">
                                        Per page:
                                    </span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) =>
                                            handlePageSizeChange(
                                                Number(e.target.value)
                                            )
                                        }
                                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p) => p - 1)}
                                    disabled={page === 0}
                                    className="rounded-xl border border-gray-200 px-4 py-2 font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    ← Previous
                                </button>
                                <button
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={!hasNextPage}
                                    className="rounded-xl border border-gray-200 px-4 py-2 font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>
        </main>
    );
}
