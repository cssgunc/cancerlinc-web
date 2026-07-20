import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import {
    collection,
    getCountFromServer,
    getDocs,
    type DocumentSnapshot,
    limit,
    orderBy,
    query,
    startAfter,
    where,
} from "firebase/firestore";
import { db } from "~/services/firebase_app";
import {
    normalizeStatus,
    PATIENT_STATUSES,
    statusLabel,
    statusStyles,
    type PatientStatus,
} from "~/types/status";
// search state lives in the URL so it survives navigating back from a member page

// --- Types ---
type Patient = {
    id: string; // Firestore uid
    name: string;
    socialWorker: string;
    lastContact: number | null; // epoch millis or null if no contact yet
    status: PatientStatus;
};

type SortField = "name" | "socialWorker" | "lastContact";
type SortDirection = "asc" | "desc";

// --- Constants ---
const PAGE_SIZE = 50;
const EASTERN_TIME_ZONE = "America/New_York";

// --- Utilities ---
function formatDate(timestampMs: number | null) {
    if (!timestampMs) return "—";
    const d = new Date(timestampMs);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: EASTERN_TIME_ZONE,
    });
}

// Firestore prefix-range search: matches names that start with the query string
function prefixRange(s: string): [string, string] {
    const lower = s.toLowerCase();
    const upper =
        lower.slice(0, -1) +
        String.fromCharCode(lower.charCodeAt(lower.length - 1) + 1);
    return [lower, upper];
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
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

// --- Component ---
export default function HomePage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [socialWorkerOptions, setSocialWorkerOptions] = useState<string[]>(
        []
    );
    const [socialWorkerFilter, setSocialWorkerFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<PatientStatus | "all">(
        "all"
    );
    const [sortField, setSortField] = useState<SortField>("lastContact");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    // Stat card counts (from aggregation queries — independent of pagination)
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [activeCount, setActiveCount] = useState<number | null>(null);
    const [urgentCount, setUrgentCount] = useState<number | null>(null);

    // Pagination cursors: stack of "last doc of each page" so we can go back
    const cursorStack = useRef<DocumentSnapshot[]>([]);
    const [page, setPage] = useState(0); // 0-indexed current page
    const [hasNextPage, setHasNextPage] = useState(false);

    // Search value comes from the URL (?q=) — written by the shared TopBar in app_layout
    const query2 = searchParams.get("q") ?? "";
    const [debouncedQuery, setDebouncedQuery] = useState(query2);

    // Debounce the URL search param into the Firestore query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query2.trim().toLowerCase());
        }, 300);
        return () => clearTimeout(timer);
    }, [query2]);

    // Fetch stat card counts once on mount
    useEffect(() => {
        const usersRef = collection(db, "users");
        Promise.all([
            getCountFromServer(
                query(
                    usersRef,
                    where("role", "==", "patient"),
                    where("isVerified", "==", true)
                )
            ),
            getCountFromServer(
                query(
                    usersRef,
                    where("role", "==", "patient"),
                    where("isVerified", "==", true),
                    where("status", "==", "active")
                )
            ),
            getCountFromServer(
                query(
                    usersRef,
                    where("role", "==", "patient"),
                    where("isVerified", "==", true),
                    where("status", "==", "urgent")
                )
            ),
        ])
            .then(([total, active, urgent]) => {
                setTotalCount(total.data().count);
                setActiveCount(active.data().count);
                setUrgentCount(urgent.data().count);
            })
            .catch(() => {
                // Non-critical — stat cards just stay blank
            });
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function loadSocialWorkers() {
            try {
                const usersRef = collection(db, "users");
                const snapshot = await getDocs(
                    query(
                        usersRef,
                        where("role", "==", "social_worker"),
                        orderBy("lastName"),
                        limit(100)
                    )
                );
                if (cancelled) return;

                const names = snapshot.docs
                    .map((doc) => {
                        const data = doc.data();
                        return (
                            `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ||
                            data.email ||
                            "Unknown"
                        );
                    })
                    .filter(Boolean);

                setSocialWorkerOptions([...new Set(names)]);
            } catch {
                if (!cancelled) setSocialWorkerOptions([]);
            }
        }

        void loadSocialWorkers();
        return () => {
            cancelled = true;
        };
    }, []);

    // Fetch patients whenever page or search changes
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        async function fetchPatients() {
            try {
                const usersRef = collection(db, "users");
                const constraints: Parameters<typeof query>[1][] = [
                    where("role", "==", "patient"),
                    where("isVerified", "==", true),
                ];

                if (debouncedQuery.length > 0) {
                    const [lo, hi] = prefixRange(debouncedQuery);
                    const patientQueries = [
                        getDocs(
                            query(
                                usersRef,
                                where("role", "==", "patient"),
                                where("isVerified", "==", true),
                                where("lastNameLower", ">=", lo),
                                where("lastNameLower", "<", hi),
                                orderBy("lastNameLower"),
                                limit(PAGE_SIZE)
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
                                    where("isVerified", "==", true),
                                    where("firstName", ">=", firstLo),
                                    where("firstName", "<", firstHi),
                                    orderBy("firstName"),
                                    limit(PAGE_SIZE)
                                )
                            )
                        );
                    }

                    const socialWorkerQueries = [
                        query(
                            usersRef,
                            where("role", "==", "social_worker"),
                            where("lastNameLower", ">=", lo),
                            where("lastNameLower", "<", hi),
                            orderBy("lastNameLower"),
                            limit(PAGE_SIZE)
                        ),
                    ];

                    for (const variant of firstNameQueryVariants(
                        debouncedQuery
                    )) {
                        const [firstLo, firstHi] =
                            prefixRangeExactCase(variant);
                        socialWorkerQueries.push(
                            query(
                                usersRef,
                                where("role", "==", "social_worker"),
                                where("firstName", ">=", firstLo),
                                where("firstName", "<", firstHi),
                                orderBy("firstName"),
                                limit(PAGE_SIZE)
                            )
                        );
                    }

                    const [patientSnaps, socialWorkerSnaps] = await Promise.all(
                        [
                            Promise.all(patientQueries),
                            Promise.all(
                                socialWorkerQueries.map((q) => getDocs(q))
                            ),
                        ]
                    );
                    if (cancelled) return;

                    const socialWorkerIds = [
                        ...new Set(
                            socialWorkerSnaps.flatMap((snap) =>
                                snap.docs.map((doc) => doc.id)
                            )
                        ),
                    ];
                    const assignedPatientQueries = chunk(
                        socialWorkerIds,
                        10
                    ).map((ids) =>
                        getDocs(
                            query(
                                usersRef,
                                where("role", "==", "patient"),
                                where("isVerified", "==", true),
                                where("assignedSocialWorkerId", "in", ids),
                                limit(PAGE_SIZE)
                            )
                        )
                    );
                    const patientBySocialWorkerSnaps = await Promise.all(
                        assignedPatientQueries
                    );
                    if (cancelled) return;

                    // Merge and deduplicate
                    const seen = new Set<string>();
                    const merged = [
                        ...patientSnaps.flatMap((snap) => snap.docs),
                        ...patientBySocialWorkerSnaps.flatMap(
                            (snap) => snap.docs
                        ),
                    ]
                        .filter((d) => {
                            if (seen.has(d.id)) return false;
                            seen.add(d.id);
                            return true;
                        })
                        .sort((a, b) => {
                            const aLastName = String(a.data().lastName ?? "");
                            const bLastName = String(b.data().lastName ?? "");
                            return aLastName.localeCompare(bLastName);
                        })
                        .slice(0, PAGE_SIZE);

                    const results: Patient[] = merged.map((d) => {
                        const data = d.data();
                        const ts = data.lastContactTimestamp;
                        return {
                            id: d.id,
                            name:
                                `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ||
                                data.email,
                            socialWorker: data.assignedSocialWorkerName ?? "—",
                            lastContact: ts ? ts.toMillis() : null,
                            status: normalizeStatus(data.status),
                        };
                    });

                    setPatients(results);
                    setHasNextPage(false);
                } else {
                    constraints.push(orderBy("lastName"));

                    // Pagination cursor
                    if (page > 0 && cursorStack.current[page - 1]) {
                        constraints.push(
                            startAfter(cursorStack.current[page - 1])
                        );
                    }

                    constraints.push(limit(PAGE_SIZE + 1));

                    const snap = await getDocs(query(usersRef, ...constraints));
                    if (cancelled) return;

                    const hasNext = snap.docs.length > PAGE_SIZE;
                    const docs = hasNext
                        ? snap.docs.slice(0, PAGE_SIZE)
                        : snap.docs;

                    if (docs.length > 0 && cursorStack.current.length <= page) {
                        cursorStack.current[page] = docs[docs.length - 1];
                    }

                    const results: Patient[] = docs.map((d) => {
                        const data = d.data();
                        const ts = data.lastContactTimestamp;
                        return {
                            id: d.id,
                            name:
                                `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ||
                                data.email,
                            socialWorker: data.assignedSocialWorkerName ?? "—",
                            lastContact: ts ? ts.toMillis() : null,
                            status: normalizeStatus(data.status),
                        };
                    });

                    setPatients(results);
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

        fetchPatients();
        return () => {
            cancelled = true;
        };
    }, [page, debouncedQuery]);

    // Reset to page 0 when search changes
    useEffect(() => {
        cursorStack.current = [];
        setPage(0);
    }, [debouncedQuery]);

    const visiblePatients = useMemo(() => {
        const filtered = patients.filter((patient) => {
            if (
                socialWorkerFilter !== "all" &&
                patient.socialWorker !== socialWorkerFilter
            ) {
                return false;
            }

            if (statusFilter !== "all" && patient.status !== statusFilter) {
                return false;
            }

            return true;
        });

        return [...filtered].sort((a, b) => {
            let comparison = 0;

            if (sortField === "lastContact") {
                comparison = (a.lastContact ?? 0) - (b.lastContact ?? 0);
            } else if (sortField === "name") {
                comparison = a.name.localeCompare(b.name);
            } else {
                comparison = a.socialWorker.localeCompare(b.socialWorker);
            }

            return sortDirection === "asc" ? comparison : -comparison;
        });
    }, [patients, socialWorkerFilter, sortDirection, sortField, statusFilter]);

    function handleSort(nextField: SortField) {
        if (sortField === nextField) {
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }

        setSortField(nextField);
        setSortDirection(nextField === "lastContact" ? "desc" : "asc");
    }

    function sortLabel(field: SortField) {
        if (sortField !== field) return "";
        return sortDirection === "asc" ? "↑" : "↓";
    }

    function goToProfile(id: string) {
        navigate(`/member/${encodeURIComponent(id)}`);
    }

    return (
        <>
            <main className="container mx-auto px-6 py-8">
                <h1 className="text-2xl font-semibold text-gray-900">
                    Patient Dashboard
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    Manage and view all patients and their assigned social
                    workers. Click on any patient name to view their detailed
                    profile.
                </p>

                {/* Stat Cards */}
                <section className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    <StatCard label="Total Patients" value={totalCount} />
                    <StatCard label="Urgent Cases" value={urgentCount} />
                    <StatCard label="Active Cases" value={activeCount} />
                </section>

                {/* Table */}
                <section className="relative mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                    {filtersOpen ? (
                        <div className="absolute right-6 top-16 z-10 w-[min(92vw,620px)] rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-lg">
                            <div className="flex flex-wrap items-end gap-4">
                                <label className="flex min-w-[220px] flex-col gap-2 text-sm text-gray-600">
                                    <span className="font-medium">
                                        Assigned Social Worker
                                    </span>
                                    <select
                                        value={socialWorkerFilter}
                                        onChange={(e) =>
                                            setSocialWorkerFilter(
                                                e.target.value
                                            )
                                        }
                                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                                    >
                                        <option value="all">
                                            All social workers
                                        </option>
                                        {socialWorkerOptions.map((worker) => (
                                            <option key={worker} value={worker}>
                                                {worker}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="flex min-w-[180px] flex-col gap-2 text-sm text-gray-600">
                                    <span className="font-medium">Status</span>
                                    <select
                                        value={statusFilter}
                                        onChange={(e) =>
                                            setStatusFilter(
                                                e.target.value as
                                                    | PatientStatus
                                                    | "all"
                                            )
                                        }
                                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-600"
                                    >
                                        <option value="all">
                                            All statuses
                                        </option>
                                        {PATIENT_STATUSES.map((status) => (
                                            <option key={status} value={status}>
                                                {statusLabel(status)}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setSocialWorkerFilter("all");
                                        setStatusFilter("all");
                                    }}
                                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Reset Filters
                                </button>
                            </div>
                        </div>
                    ) : null}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 text-left text-sm text-gray-600 select-none">
                                <tr>
                                    <th className="px-6 py-4 font-medium">
                                        <button
                                            type="button"
                                            onClick={() => handleSort("name")}
                                            className="inline-flex items-center gap-1 hover:text-gray-900"
                                        >
                                            Patient Name
                                            <span>{sortLabel("name")}</span>
                                        </button>
                                    </th>
                                    <th className="px-6 py-4 font-medium">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSort("socialWorker")
                                            }
                                            className="inline-flex items-center gap-1 hover:text-gray-900"
                                        >
                                            Assigned Social Worker
                                            <span>
                                                {sortLabel("socialWorker")}
                                            </span>
                                        </button>
                                    </th>
                                    <th className="px-6 py-4 font-medium">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSort("lastContact")
                                            }
                                            className="inline-flex items-center gap-1 hover:text-gray-900"
                                        >
                                            Last Contact
                                            <span>
                                                {sortLabel("lastContact")}
                                            </span>
                                        </button>
                                    </th>
                                    <th className="px-6 py-4 font-medium">
                                        Status
                                    </th>
                                    <th className="px-6 py-4 font-medium">
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
                                            colSpan={5}
                                            className="px-6 py-12 text-center text-gray-400"
                                        >
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                        </td>
                                    </tr>
                                ) : error ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="px-6 py-10 text-center text-sm text-red-600"
                                        >
                                            {error}
                                        </td>
                                    </tr>
                                ) : visiblePatients.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="px-6 py-10 text-center text-sm text-gray-400"
                                        >
                                            No patients match the current
                                            filters.
                                        </td>
                                    </tr>
                                ) : (
                                    visiblePatients.map((p) => (
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
                                            <td className="px-6 py-4 text-gray-700">
                                                {p.socialWorker}
                                            </td>
                                            <td className="px-6 py-4 text-gray-700">
                                                {formatDate(p.lastContact)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles(p.status)}`}
                                                >
                                                    {statusLabel(p.status)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() =>
                                                        goToProfile(p.id)
                                                    }
                                                    className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800"
                                                >
                                                    View Profile
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {!loading && !error && (totalCount ?? 0) > PAGE_SIZE && (
                        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 text-sm text-gray-600">
                            <span>
                                Showing {page * PAGE_SIZE + 1}–
                                {page * PAGE_SIZE + patients.length}
                                {totalCount != null
                                    ? ` of ${totalCount}`
                                    : ""}{" "}
                                patients
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPage((p) => p - 1)}
                                    disabled={page === 0}
                                    className="rounded-xl border border-gray-200 px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    ← Previous
                                </button>
                                <button
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={!hasNextPage}
                                    className="rounded-xl border border-gray-200 px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </>
    );
}

// --- Small components ---
function StatCard({ label, value }: { label: string; value: number | null }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-600">{label}</div>
            <div className="mt-3 text-2xl font-semibold text-gray-900">
                {value == null ? (
                    <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
                ) : (
                    value
                )}
            </div>
        </div>
    );
}
