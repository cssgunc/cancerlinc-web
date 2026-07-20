import React, { useEffect, useMemo, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    X,
    Pencil,
    Trash2,
    Calendar,
    MapPin,
    Video,
} from "lucide-react";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    Timestamp,
    query,
    orderBy,
} from "firebase/firestore";
import { db } from "~/services/firebase_app";

// types
interface CalendarEvent {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    description: string;
    tags: string[];
    location?: string;
    isVirtual?: boolean;
}

const TAGS = [
    "Support Group",
    "Workshop",
    "Clinic",
    "Webinar",
    "Community",
    "Fundraiser",
    "Appointment",
    "Info Session",
];

const TAG_COLORS: Record<string, string> = {
    "Support Group": "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    Workshop: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
    Clinic: "bg-green-50 text-green-700 ring-1 ring-green-200",
    Webinar: "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200",
    Community: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
    Fundraiser: "bg-pink-50 text-pink-700 ring-1 ring-pink-200",
    Appointment: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
    "Info Session": "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
};

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// --- Helpers ---
function toDateStr(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function formatDisplayDate(s: string) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}
function fmt12(t: string) {
    if (!t) return "";
    const [h, min] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${ampm}`;
}

const EMPTY_FORM = {
    title: "",
    date: "",
    startTime: "",
    endTime: "",
    description: "",
    tags: [] as string[],
    location: "",
    isVirtual: false,
};

// --- Page ---
export default function CalendarPage() {
    const today = new Date();
    const todayStr = toDateStr(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
    );

    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
    const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    //Firestore real-time listener
    useEffect(() => {
        const q = query(collection(db, "events"), orderBy("date"));
        return onSnapshot(
            q,
            (snap) => {
                setEvents(
                    snap.docs.map(
                        (d) => ({ id: d.id, ...d.data() }) as CalendarEvent
                    )
                );
                setLoading(false);
            },
            (err) => {
                setError(err.message);
                setLoading(false);
            }
        );
    }, []);

    //Calendar grid
    const cells = useMemo(() => {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const grid: (number | null)[] = Array(firstDay).fill(null);
        for (let d = 1; d <= daysInMonth; d++) grid.push(d);
        return grid;
    }, [year, month]);

    // Events grouped by date
    const byDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        for (const ev of events) {
            (map[ev.date] ??= []).push(ev);
        }
        return map;
    }, [events]);

    const dayEvents = selectedDay ? (byDate[selectedDay] ?? []) : [];

    // Month nav
    function prevMonth() {
        if (month === 0) {
            setMonth(11);
            setYear((y) => y - 1);
        } else setMonth((m) => m - 1);
    }
    function nextMonth() {
        if (month === 11) {
            setMonth(0);
            setYear((y) => y + 1);
        } else setMonth((m) => m + 1);
    }

    // Modal helpers
    function openAdd(date?: string) {
        setForm({ ...EMPTY_FORM, date: date ?? todayStr });
        setEditTarget(null);
        setModalMode("add");
    }
    function openEdit(ev: CalendarEvent) {
        setForm({
            title: ev.title,
            date: ev.date,
            startTime: ev.startTime,
            endTime: ev.endTime,
            description: ev.description,
            tags: [...ev.tags],
            location: ev.location ?? "",
            isVirtual: ev.isVirtual ?? false,
        });
        setEditTarget(ev);
        setModalMode("edit");
    }
    function closeModal() {
        setModalMode(null);
        setEditTarget(null);
        setForm(EMPTY_FORM);
    }

    async function saveEvent() {
        if (!form.title.trim() || !form.date) return;
        setSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                date: form.date,
                startTime: form.startTime,
                endTime: form.endTime,
                description: form.description.trim(),
                tags: form.tags,
                location: form.location.trim(),
                isVirtual: form.isVirtual,
                updatedAt: Timestamp.now(),
            };
            if (modalMode === "add") {
                await addDoc(collection(db, "events"), {
                    ...payload,
                    createdAt: Timestamp.now(),
                });
            } else if (editTarget) {
                await updateDoc(doc(db, "events", editTarget.id), payload);
            }
            closeModal();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save event");
        } finally {
            setSaving(false);
        }
    }

    async function deleteEvent(id: string) {
        if (!confirm("Delete this event?")) return;
        try {
            await deleteDoc(doc(db, "events", id));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete event");
        }
    }

    function toggleTag(tag: string) {
        setForm((f) => ({
            ...f,
            tags: f.tags.includes(tag)
                ? f.tags.filter((t) => t !== tag)
                : [...f.tags, tag],
        }));
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Main */}
            <main className="container mx-auto px-6 py-8">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900">
                            Event Calendar
                        </h1>
                        <p className="mt-1 text-sm text-gray-600">
                            Schedule and manage community events for patients.
                        </p>
                    </div>
                    <button
                        onClick={() => openAdd(selectedDay ?? undefined)}
                        className="flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800"
                    >
                        <Plus className="h-4 w-4" />
                        Add Event
                    </button>
                </div>

                {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="flex flex-col gap-6 lg:flex-row">
                    {/* Calendar grid */}
                    <div className="flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        {/* Month nav */}
                        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                            <button
                                onClick={prevMonth}
                                className="rounded-lg p-1.5 hover:bg-gray-100"
                            >
                                <ChevronLeft className="h-5 w-5 text-gray-600" />
                            </button>
                            <span className="font-semibold text-gray-900">
                                {MONTH_NAMES[month]} {year}
                            </span>
                            <button
                                onClick={nextMonth}
                                className="rounded-lg p-1.5 hover:bg-gray-100"
                            >
                                <ChevronRight className="h-5 w-5 text-gray-600" />
                            </button>
                        </div>

                        {/* Day-of-week headers */}
                        <div className="grid grid-cols-7 border-b border-gray-100">
                            {DAYS.map((d) => (
                                <div
                                    key={d}
                                    className="py-2 text-center text-xs font-medium text-gray-400"
                                >
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Cells */}
                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-800" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-7">
                                {cells.map((day, i) => {
                                    if (day === null)
                                        return (
                                            <div
                                                key={`e-${i}`}
                                                className="min-h-[80px] border-b border-r border-gray-50"
                                            />
                                        );
                                    const ds = toDateStr(year, month, day);
                                    const evs = byDate[ds] ?? [];
                                    const isToday = ds === todayStr;
                                    const isSel = ds === selectedDay;
                                    return (
                                        <button
                                            key={ds}
                                            onClick={() =>
                                                setSelectedDay(
                                                    isSel ? null : ds
                                                )
                                            }
                                            className={`min-h-[80px] border-b border-r border-gray-100 p-2 text-left transition-colors
                                                ${isSel ? "bg-gray-900" : isToday ? "bg-green-50 hover:bg-green-100" : "hover:bg-gray-50"}`}
                                        >
                                            <span
                                                className={`text-xs font-medium
                                                ${isSel ? "text-white" : isToday ? "text-green-700" : "text-gray-700"}`}
                                            >
                                                {day}
                                            </span>
                                            <div className="mt-1 space-y-0.5">
                                                {evs.slice(0, 2).map((ev) => (
                                                    <div
                                                        key={ev.id}
                                                        className={`w-full truncate rounded px-1 py-0.5 text-[10px] leading-tight
                                                            ${isSel ? "bg-white/20 text-white" : "bg-gray-800 text-white"}`}
                                                    >
                                                        {ev.title}
                                                    </div>
                                                ))}
                                                {evs.length > 2 && (
                                                    <span
                                                        className={`text-[10px] ${isSel ? "text-white/60" : "text-gray-400"}`}
                                                    >
                                                        +{evs.length - 2} more
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Side panel */}
                    <div className="w-full lg:w-80 shrink-0">
                        {selectedDay ? (
                            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                                    <div>
                                        <div className="text-xs text-gray-500">
                                            {formatDisplayDate(selectedDay)}
                                        </div>
                                        <div className="mt-0.5 font-semibold text-gray-900">
                                            {dayEvents.length} Event
                                            {dayEvents.length !== 1 ? "s" : ""}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => openAdd(selectedDay)}
                                            className="rounded-lg bg-black p-1.5 text-white hover:bg-gray-800"
                                            title="Add event"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => setSelectedDay(null)}
                                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
                                    {dayEvents.length === 0 ? (
                                        <div className="py-10 text-center text-sm text-gray-400">
                                            No events — click + to add one
                                        </div>
                                    ) : (
                                        dayEvents.map((ev) => (
                                            <div
                                                key={ev.id}
                                                className="px-5 py-4"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate font-medium text-gray-900">
                                                            {ev.title}
                                                        </div>
                                                        {(ev.startTime ||
                                                            ev.endTime) && (
                                                            <div className="mt-0.5 text-xs text-gray-500">
                                                                {fmt12(
                                                                    ev.startTime
                                                                )}
                                                                {ev.startTime &&
                                                                ev.endTime
                                                                    ? " – "
                                                                    : ""}
                                                                {fmt12(
                                                                    ev.endTime
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                                                            {ev.isVirtual ? (
                                                                <Video className="h-3 w-3 shrink-0" />
                                                            ) : (
                                                                <MapPin className="h-3 w-3 shrink-0" />
                                                            )}
                                                            <span className="truncate">
                                                                {ev.isVirtual
                                                                    ? "Virtual"
                                                                    : "In-person"}
                                                                {ev.location
                                                                    ? ` · ${ev.location}`
                                                                    : ""}
                                                            </span>
                                                        </div>
                                                        {ev.description && (
                                                            <div className="mt-1 line-clamp-2 text-xs text-gray-600">
                                                                {ev.description}
                                                            </div>
                                                        )}
                                                        {ev.tags?.length >
                                                            0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {ev.tags.map(
                                                                    (tag) => (
                                                                        <span
                                                                            key={
                                                                                tag
                                                                            }
                                                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${TAG_COLORS[tag] ?? "bg-gray-100 text-gray-700"}`}
                                                                        >
                                                                            {
                                                                                tag
                                                                            }
                                                                        </span>
                                                                    )
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex shrink-0 gap-1">
                                                        <button
                                                            onClick={() =>
                                                                openEdit(ev)
                                                            }
                                                            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                                            title="Edit"
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                deleteEvent(
                                                                    ev.id
                                                                )
                                                            }
                                                            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-sm">
                                <Calendar className="mx-auto mb-3 h-8 w-8 text-gray-300" />
                                <p className="text-sm text-gray-400">
                                    Click a day to view its events
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Add / Edit Modal */}
            {modalMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {modalMode === "add"
                                    ? "Add Event"
                                    : "Edit Event"}
                            </h2>
                            <button
                                onClick={closeModal}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-700">
                                    Title *
                                </label>
                                <input
                                    value={form.title}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            title: e.target.value,
                                        }))
                                    }
                                    placeholder="Event title"
                                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-700">
                                    Date *
                                </label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            date: e.target.value,
                                        }))
                                    }
                                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                                />
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-xs font-medium text-gray-700">
                                        Start Time
                                    </label>
                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                startTime: e.target.value,
                                            }))
                                        }
                                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-medium text-gray-700">
                                        End Time
                                    </label>
                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={(e) =>
                                            setForm((f) => ({
                                                ...f,
                                                endTime: e.target.value,
                                            }))
                                        }
                                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-700">
                                    Description
                                </label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            description: e.target.value,
                                        }))
                                    }
                                    rows={3}
                                    placeholder="Optional details..."
                                    className="mt-1 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-medium text-gray-700">
                                    Format
                                </label>
                                <div className="flex gap-2">
                                    {[false, true].map((virtual) => (
                                        <button
                                            key={String(virtual)}
                                            type="button"
                                            onClick={() =>
                                                setForm((f) => ({
                                                    ...f,
                                                    isVirtual: virtual,
                                                }))
                                            }
                                            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors
                                                ${
                                                    form.isVirtual === virtual
                                                        ? "bg-gray-900 text-white"
                                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                }`}
                                        >
                                            {virtual ? (
                                                <Video className="h-3.5 w-3.5" />
                                            ) : (
                                                <MapPin className="h-3.5 w-3.5" />
                                            )}
                                            {virtual ? "Virtual" : "In-person"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-700">
                                    Location
                                </label>
                                <input
                                    value={form.location}
                                    onChange={(e) =>
                                        setForm((f) => ({
                                            ...f,
                                            location: e.target.value,
                                        }))
                                    }
                                    placeholder="Address or meeting link"
                                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-600"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-xs font-medium text-gray-700">
                                    Tags
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {TAGS.map((tag) => (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors
                                                ${
                                                    form.tags.includes(tag)
                                                        ? "bg-gray-900 text-white"
                                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={closeModal}
                                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEvent}
                                disabled={
                                    !form.title.trim() || !form.date || saving
                                }
                                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800 disabled:opacity-50"
                            >
                                {saving ? "Saving…" : "Save Event"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
