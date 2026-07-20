import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
    Link,
    Outlet,
    useLocation,
    useMatch,
    useNavigate,
    useSearchParams,
} from "react-router";
import { useAuth } from "~/services/firebase_provider";
import NotificationBell from "~/components/NotificationBell";
import UnverifiedIndicator from "~/components/UnverifiedIndicator";
import { isSuperuser } from "~/services/staff_admin_service";

const SEARCH_HINTS = [
    "Search by last name..",
    "Search for patients..",
    "Search for social worker..",
];

export default function AppLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const onMemberPage = useMatch("/member/:user");
    const navState = location.state as { from?: string; view?: unknown } | null;
    const backTo = navState?.from ?? "/";
    const [memberSearchValue, setMemberSearchValue] = useState("");
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [activeHintIndex, setActiveHintIndex] = useState(0);
    const [upcomingHintIndex, setUpcomingHintIndex] = useState(1);
    const [isHintTransitioning, setIsHintTransitioning] = useState(false);

    const searchValue = searchParams.get("q") ?? "";
    const inputValue = onMemberPage ? memberSearchValue : searchValue;
    const shouldShowHint = inputValue.length === 0 && !isSearchFocused;

    useEffect(() => {
        if (!onMemberPage) {
            setMemberSearchValue("");
        }
    }, [onMemberPage]);

    useEffect(() => {
        if (!shouldShowHint) {
            setIsHintTransitioning(false);
            return;
        }

        const timer = window.setInterval(() => {
            setUpcomingHintIndex((activeHintIndex + 1) % SEARCH_HINTS.length);
            setIsHintTransitioning(true);
        }, 2600);

        return () => window.clearInterval(timer);
    }, [activeHintIndex, shouldShowHint]);

    useEffect(() => {
        if (!isHintTransitioning) return;

        const timer = window.setTimeout(() => {
            setActiveHintIndex(upcomingHintIndex);
            setIsHintTransitioning(false);
        }, 420);

        return () => window.clearTimeout(timer);
    }, [isHintTransitioning, upcomingHintIndex]);

    function handleSearchChange(value: string) {
        if (onMemberPage) {
            setMemberSearchValue(value);

            // On member page: navigate to dashboard with query pre-filled
            if (value) {
                navigate(`/?q=${encodeURIComponent(value)}`);
            } else {
                navigate("/");
            }
        } else {
            // On index: update the URL param in place
            setSearchParams(value ? { q: value } : {}, { replace: true });
        }
    }

    return (
        <div
            className={
                onMemberPage
                    ? "flex h-screen flex-col overflow-hidden bg-gray-50"
                    : "min-h-screen bg-gray-50"
            }
        >
            <header className="shrink-0 border-b bg-white/95 backdrop-blur">
                <div className="container mx-auto flex items-center gap-4 px-6 py-4">
                    {/* Back button — only on member pages */}
                    {onMemberPage ? (
                        <button
                            type="button"
                            onClick={() =>
                                navigate(backTo, {
                                    state: navState?.view
                                        ? { view: navState.view }
                                        : undefined,
                                })
                            }
                            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shrink-0"
                        >
                            ← Back
                        </button>
                    ) : null}

                    {/* Logo — routes back to the dashboard */}
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        aria-label="Go to dashboard"
                        className="shrink-0 cursor-pointer"
                    >
                        <img
                            src="/CancerLINC-Logo-1.png"
                            alt="CancerLINC Logo"
                            className="w-16 mb-4"
                        />
                    </button>

                    {/* Search */}
                    <div className="relative mx-4 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        {shouldShowHint ? (
                            <div className="pointer-events-none absolute inset-y-0 left-10 right-4 flex items-center overflow-hidden text-sm text-gray-400">
                                <span
                                    className={`search-hint ${
                                        isHintTransitioning
                                            ? "search-hint-leave"
                                            : "search-hint-active"
                                    }`}
                                >
                                    {SEARCH_HINTS[activeHintIndex]}
                                </span>
                                {isHintTransitioning ? (
                                    <span className="search-hint search-hint-enter">
                                        {SEARCH_HINTS[upcomingHintIndex]}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                        <input
                            id="topbar-search"
                            value={inputValue}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setIsSearchFocused(false)}
                            placeholder=""
                            aria-label="Search patients or assigned social workers"
                            className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                        />
                    </div>

                    {/* Notifications + Unverified indicator */}
                    <div className="flex items-center gap-2">
                        <NotificationBell />
                        <UnverifiedIndicator />
                    </div>

                    {/* Welcome / Logout */}
                    <div className="ml-auto hidden items-center gap-4 text-sm text-gray-600 md:flex shrink-0">
                        <span>Welcome, {user?.displayName}</span>
                        {isSuperuser(user?.email) ? (
                            <Link
                                to="/staff"
                                className="font-medium text-gray-900 underline underline-offset-2"
                            >
                                Staff
                            </Link>
                        ) : null}
                        <button
                            type="button"
                            onClick={logout}
                            className="font-medium text-gray-900 underline underline-offset-2"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <div
                className={
                    onMemberPage
                        ? "flex flex-1 flex-col overflow-hidden"
                        : undefined
                }
            >
                <Outlet />
            </div>
        </div>
    );
}
