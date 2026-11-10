"use client";

import { useEffect, useMemo, useState } from "react";
import { ListLoader } from "@/app/components/list-loader";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export type HqDayStatus = "present" | "late" | "leave" | "absent" | "in" | "off" | "upcoming";

export type HqDayRecord = {
  date: string;
  status: HqDayStatus;
  clockIn?: string | null;
  clockOut?: string | null;
  lateMinutes?: number;
};

export type HqAttendancePerson = {
  id: string;
  name: string;
  jobTitle: string;
  place?: string;
  photoUrl?: string | null;
  days: HqDayRecord[];
};

type RosterPerson = {
  id: string;
  name: string;
  jobTitle: string;
  place: string;
  photoUrl: string | null;
  linked: boolean;
  punches: string[];
};

const START_TIME = "08:00";
const FILTERS = [
  { id: "present", label: "On time" },
  { id: "late", label: "Late" },
  { id: "leave", label: "Leave" },
  { id: "absent", label: "Absent" },
  { id: "in", label: "On site" }
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const AVATAR = [
  "bg-orange-100 text-orange-800",
  "bg-slate-200 text-slate-700",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800"
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIso(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function startOfWeek(iso: string) {
  const date = parseIso(iso);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function weekdayLabel(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "long" });
}

function shortDate(iso: string) {
  return parseIso(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatClock(value?: string | null) {
  if (!value) return "";
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minuteText}${suffix}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function lagosParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(iso));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, time: `${read("hour")}:${read("minute")}` };
}

function buildDays(punches: string[], week: Date[], today: string, startTime: string, markEmpty: boolean): HqDayRecord[] {
  const byDate = new Map<string, string[]>();
  for (const punch of punches) {
    if (!punch) continue;
    const part = lagosParts(punch);
    const times = byDate.get(part.date) ?? [];
    times.push(part.time);
    byDate.set(part.date, times);
  }
  return week.map((date) => {
    const iso = isoDate(date);
    if (date.getDay() === 0 || date.getDay() === 6) return { date: iso, status: "off" as const };
    if (iso > today) return { date: iso, status: "upcoming" as const };
    const times = (byDate.get(iso) ?? []).sort();
    if (!times.length) return { date: iso, status: markEmpty ? ("absent" as const) : ("upcoming" as const) };
    const clockIn = times[0];
    const clockOut = times.length > 1 ? times[times.length - 1] : null;
    if (clockIn > startTime) {
      const [hour, minute] = clockIn.split(":").map(Number);
      const [startHour, startMinute] = startTime.split(":").map(Number);
      return { date: iso, status: "late" as const, clockIn, clockOut, lateMinutes: hour * 60 + minute - (startHour * 60 + startMinute) };
    }
    if (!clockOut && iso === today) return { date: iso, status: "in" as const, clockIn };
    return { date: iso, status: "present" as const, clockIn, clockOut };
  });
}

function dayOf(person: HqAttendancePerson, iso: string) {
  return person.days.find((day) => day.date === iso);
}

function matchesFilter(person: HqAttendancePerson, weekIsos: string[], filters: FilterId[]) {
  if (!filters.length) return true;
  return person.days.some((day) => weekIsos.includes(day.date) && filters.includes(day.status as FilterId));
}

function downloadCsv(people: HqAttendancePerson[], week: Date[]) {
  const header = ["Employee", "Role", "Place", ...week.map((date) => `${weekdayLabel(date)} ${isoDate(date)}`)];
  const lines = people.map((person) => {
    const cells = week.map((date) => {
      const day = dayOf(person, isoDate(date));
      if (!day || day.status === "off" || day.status === "upcoming") return "";
      if (day.status === "leave") return "Leave";
      if (day.status === "absent") return "Absent";
      const signIn = formatClock(day.clockIn);
      const signOut = day.clockOut ? formatClock(day.clockOut) : "";
      const arrived = day.status === "late" ? `Late ${signIn}` : signIn;
      return signOut ? `Sign in ${arrived} / Sign out ${signOut}` : `Sign in ${arrived}`;
    });
    return [person.name, person.jobTitle, person.place ?? "", ...cells];
  });
  const csv = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hq-attendance-${isoDate(week[0])}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StatusIcon({ kind }: { kind: "present" | "late" | "leave" | "absent" }) {
  const common = "h-4 w-4";
  if (kind === "present") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 1.5" />
      </svg>
    );
  }
  if (kind === "late") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  if (kind === "leave") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

function DayCell({ day, today }: { day?: HqDayRecord; today: string }) {
  if (!day || day.status === "upcoming") {
    return <div className="min-h-[4.5rem] rounded-xl" />;
  }
  if (day.status === "off") {
    return (
      <div
        className="min-h-[4.5rem] rounded-xl"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(148,163,184,0.18) 0 6px, transparent 6px 12px)"
        }}
      />
    );
  }
  if (day.status === "leave" || day.status === "absent" || !day.clockIn) {
    const tone = day.status === "leave" ? "bg-violet-50 text-violet-900" : "bg-rose-50 text-rose-900";
    return (
      <div className={`flex min-h-[5.25rem] items-center rounded-xl px-2 py-2 text-sm font-semibold ${tone}`}>
        {day.status === "leave" ? "Leave" : "Absent"}
      </div>
    );
  }

  const late = day.status === "late";
  const signedOut = Boolean(day.clockOut);
  const signOutLabel = signedOut ? formatClock(day.clockOut) : day.date === today ? "Not yet" : "Missing";
  return (
    <div className={`min-h-[5.25rem] rounded-xl px-2 py-2 ${late ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">Sign in{late ? " · late" : ""}</p>
      <p className="text-sm font-semibold tabular-nums">{formatClock(day.clockIn)}</p>
      <p className={`mt-1 text-[10px] font-bold uppercase tracking-[0.08em] ${signedOut ? "opacity-70" : "text-slate-400"}`}>Sign out</p>
      <p className={`text-sm font-semibold tabular-nums ${signedOut ? "" : "text-slate-400"}`}>{signOutLabel}</p>
    </div>
  );
}

export function HqAttendance({ people, startTime = START_TIME }: { people?: HqAttendancePerson[]; startTime?: string }) {
  const today = isoDate(new Date());
  const [selected, setSelected] = useState(today);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterId[]>([]);
  const [roster, setRoster] = useState<RosterPerson[] | null>(null);
  const [clockReachable, setClockReachable] = useState(false);
  const [linkedCount, setLinkedCount] = useState(0);
  const [loading, setLoading] = useState(!people);
  const [error, setError] = useState("");
  const weekStart = startOfWeek(selected);
  const week = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekIsos = week.map(isoDate);

  useEffect(() => {
    if (people) return;
    let cancel = false;
    async function load() {
      try {
        const { data } = await getSupabaseBrowser().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("You must be signed in.");
        const response = await fetch("/api/attendance/hq", { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load headquarters attendance");
        if (cancel) return;
        setRoster(payload.people ?? []);
        setClockReachable(Boolean(payload.clockReachable));
        setLinkedCount(Number(payload.linked ?? 0));
      } catch (loadError) {
        if (!cancel) setError(loadError instanceof Error ? loadError.message : "Could not load headquarters attendance");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => {
      cancel = true;
    };
  }, [people]);

  const source = useMemo(() => {
    if (people) return people;
    return (roster ?? []).map((person) => ({
      id: person.id,
      name: person.name,
      jobTitle: person.jobTitle,
      place: person.place,
      photoUrl: person.photoUrl,
      days: buildDays(person.punches ?? [], week, today, startTime, clockReachable)
    }));
  }, [clockReachable, people, roster, startTime, today, week]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((person) => {
      const text = `${person.name} ${person.jobTitle} ${person.place ?? ""}`.toLowerCase();
      if (needle && !text.includes(needle)) return false;
      return matchesFilter(person, weekIsos, filters);
    });
  }, [filters, query, source, weekIsos]);

  const counts = useMemo(() => {
    const onDay = visible.map((person) => dayOf(person, selected)).filter(Boolean) as HqDayRecord[];
    return {
      present: onDay.filter((day) => day.status === "present" || day.status === "in").length,
      late: onDay.filter((day) => day.status === "late").length,
      leave: onDay.filter((day) => day.status === "leave").length,
      absent: onDay.filter((day) => day.status === "absent").length
    };
  }, [selected, visible]);

  function toggleFilter(id: FilterId) {
    setFilters((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const cards = [
    { kind: "present" as const, label: selected === today ? "Present today" : "Present", value: counts.present, note: "Clocked in on time" },
    { kind: "late" as const, label: "Late entry", value: counts.late, note: `After ${formatClock(startTime)}` },
    { kind: "leave" as const, label: "On leave", value: counts.leave, note: "Approved leave" },
    { kind: "absent" as const, label: "Absent", value: counts.absent, note: "No punch" }
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">HQ attendance</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in is the first punch of the day. Sign out is the last. Jalingo stays on its own page.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => downloadCsv(visible, week)}>
          Download
        </button>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>}
      {!people && !error && !loading && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {clockReachable
            ? `${linkedCount} clock names matched one staff record, so those rows show the full name, role, department, and photo. A repeated name such as Ruth stays on the clock name until it is linked by hand.`
            : "The staff register is showing. The K40 Pro did not answer from this computer, so clock-in times are waiting."}
        </p>
      )}
      {loading && <ListLoader label="Loading staff" variant="table" />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.kind} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <StatusIcon kind={card.kind} />
              {card.label}
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-slate-950">{pad(card.value)}</p>
            <p className="mt-1 text-xs text-slate-500">{card.note}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Search staff</span>
          <input
            type="search"
            className="form-control"
            placeholder="Search staff"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const on = filters.includes(filter.id);
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => toggleFilter(filter.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                  on ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"
                }`}
              >
                {filter.label}
                {on ? " ×" : ""}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="secondary-button" onClick={() => setSelected(isoDate(addDays(parseIso(selected), -7)))}>
            Prev
          </button>
          <label>
            <span className="sr-only">Day</span>
            <input type="date" className="form-control w-auto" value={selected} onChange={(event) => setSelected(event.target.value || today)} />
          </label>
          <button type="button" className="secondary-button" onClick={() => setSelected(isoDate(addDays(parseIso(selected), 7)))}>
            Next
          </button>
        </div>
      </div>

      {!loading && <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-[920px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
              <th className="px-4 py-3 font-bold">Employee</th>
              {week.map((date) => {
                const iso = isoDate(date);
                const weekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <th key={iso} className="px-2 py-3 font-bold">
                    <button type="button" onClick={() => setSelected(iso)} className={iso === selected ? "text-blue-800" : weekend ? "text-slate-300" : ""}>
                      <span className="block">{weekdayLabel(date).slice(0, 3)}</span>
                      <span className="mt-0.5 block text-sm font-semibold normal-case tracking-normal">{date.getDate()}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((person, index) => (
              <tr key={person.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {person.photoUrl ? (
                      <img src={person.photoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${AVATAR[index % AVATAR.length]}`}>
                        {initials(person.name)}
                      </span>
                    )}
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">{person.name}</span>
                      <span className="block text-xs text-slate-500">{person.jobTitle}</span>
                      {person.place ? <span className="block text-xs text-slate-400">{person.place}</span> : null}
                    </span>
                  </div>
                </td>
                {week.map((date) => (
                  <td key={isoDate(date)} className="px-2 py-3 align-top">
                    <DayCell day={dayOf(person, isoDate(date))} today={today} />
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No one matches this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>}
      <p className="text-xs text-slate-400">Showing {shortDate(isoDate(week[0]))} to {shortDate(isoDate(week[6]))}. Penalty rules are not applied yet.</p>
    </section>
  );
}
