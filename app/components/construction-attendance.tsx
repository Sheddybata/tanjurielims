"use client";

import { useMemo, useState } from "react";

type CrewMember = {
  staffId?: string | null;
  fullName: string;
  staffNumber?: string | null;
  photoUrl?: string | null;
};

type AttendanceSuggestion = {
  staffId: string;
  name: string;
  staffNumber?: string | null;
  jobTitle?: string | null;
  score: number;
  reason: string;
};

export type AttendanceLogRow = {
  key: string;
  staffId?: string | null;
  name: string;
  deviceName?: string | null;
  staffNumber?: string | null;
  jobTitle?: string | null;
  devicePin: string;
  firstIn: string;
  lastOut: string;
  punches: number;
  matched: boolean;
  times?: Array<{ at: string; type: string }>;
  suggestions?: AttendanceSuggestion[];
};

export type AttendanceDay = {
  date: string;
  people: number;
  present: number;
};

export type AttendanceImport = {
  id: string;
  fileName: string;
  createdAt: string;
  rowCount: number;
  matchedCount: number;
  uploadedBy?: string | null;
  firstDay?: string | null;
  lastDay?: string | null;
  days?: number;
};

function initials(name?: string | null) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0] ?? ""}${parts[1]?.[0] ?? parts[0][1] ?? ""}`.toUpperCase();
}

function formatDay(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function weekdayName(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { weekday: "long" });
}

function formatFullDay(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function hoursBetween(start?: string, end?: string) {
  if (!start || !end || start === end) return "";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  if (hours && minutes) return `${hours}h ${minutes}m on site`;
  if (hours) return `${hours}h on site`;
  return `${minutes}m on site`;
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shiftMonth(iso: string, delta: number) {
  const fallback = new Date();
  const year = Number((iso || "").slice(0, 4)) || fallback.getFullYear();
  const month = Number((iso || "").slice(5, 7)) || fallback.getMonth() + 1;
  const day = Number((iso || "").slice(8, 10)) || 1;
  const next = new Date(year, month - 1 + delta, 1);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(Math.min(day, last))}`;
}

function monthLabel(iso: string) {
  const date = new Date(`${iso.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function monthGrid(iso: string, logged: Map<string, AttendanceDay>, today: string) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!year || !month) return [];
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<{ date: string; day: number; status: "logged" | "missing" | "future"; present: number } | null> = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= last; day += 1) {
    const value = `${year}-${pad(month)}-${pad(day)}`;
    const hit = logged.get(value);
    cells.push({
      date: value,
      day,
      status: value > today ? "future" : hit ? "logged" : "missing",
      present: hit?.present ?? 0
    });
  }
  return cells;
}

function Face({ name, photoUrl }: { name?: string | null; photoUrl?: string | null }) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200" />
    );
  }
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-bold text-blue-800 ring-1 ring-blue-100">
      {initials(name)}
    </div>
  );
}

export function ConstructionAttendance({
  date,
  days,
  imports,
  rows,
  crew,
  busy,
  notice,
  canUpload,
  canLink,
  onDateChange,
  onUpload,
  onLink
}: {
  date: string;
  days: AttendanceDay[];
  imports: AttendanceImport[];
  rows: AttendanceLogRow[];
  crew: CrewMember[];
  busy?: boolean;
  notice?: string;
  canUpload?: boolean;
  canLink?: boolean;
  onDateChange: (date: string) => void;
  onUpload: (file: File) => void;
  onLink: (devicePin: string, staffId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const present = rows.filter((row) => row.matched).length;
  const pending = rows.filter((row) => !row.matched);
  const today = new Date().toISOString().slice(0, 10);
  const viewDate = date || today;
  const year = viewDate.slice(0, 4) || String(new Date().getFullYear());
  const loggedDays = useMemo(() => new Map(days.map((item) => [item.date, item])), [days]);
  const calendar = useMemo(() => monthGrid(viewDate, loggedDays, today), [loggedDays, today, viewDate]);
  const missingDay = Boolean(date && date <= today && !loggedDays.has(date));
  const dayEnded = Boolean(date && date < today);
  const needle = query.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => Number(b.matched) - Number(a.matched) || a.name.localeCompare(b.name));
    if (!needle) return sorted;
    return sorted.filter((row) =>
      [row.name, row.deviceName, row.staffNumber, row.jobTitle, row.devicePin]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [needle, rows]);

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-slate-950 text-white">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">Jalingo attendance</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">{date ? formatFullDay(date) : "F16 log"}</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {missingDay
              ? `${weekdayName(date)} is missing. Upload the F16 file and this day will fill in.`
              : "Clock times from the Hippoint F16, using the names already on the machine."}
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">On the book</p>
              <p className="mt-1 text-2xl font-semibold">{present}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">On the F16</p>
              <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">To confirm</p>
              <p className="mt-1 text-2xl font-semibold">{pending.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" className="secondary-button" onClick={() => onDateChange(shiftMonth(viewDate, -1))}>
            Prev
          </button>
          <p className="text-sm font-semibold text-slate-950">{monthLabel(viewDate)}</p>
          <button type="button" className="secondary-button" onClick={() => onDateChange(shiftMonth(viewDate, 1))}>
            Next
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((item) => (
            <p key={item} className="py-1">
              {item}
            </p>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendar.map((item, index) =>
            item ? (
              <button
                key={item.date}
                type="button"
                onClick={() => onDateChange(item.date)}
                className={`min-h-12 rounded-xl px-1 py-1.5 text-center ${
                  item.date === date
                    ? "bg-blue-800 text-white"
                    : item.status === "logged"
                      ? "bg-emerald-50 text-slate-950"
                      : item.status === "missing"
                        ? "bg-amber-50 text-amber-950"
                        : "bg-slate-50 text-slate-400"
                }`}
              >
                <p className="text-sm font-semibold tabular-nums">{item.day}</p>
                <p className={`text-[9px] font-semibold leading-tight ${item.date === date ? "text-blue-100" : ""}`}>
                  {item.status === "logged"
                    ? `${item.present} staff`
                    : item.status === "missing"
                      ? "Missing"
                      : ""}
                </p>
              </button>
            ) : (
              <div key={`blank-${index}`} />
            )
          )}
        </div>
      </div>

      {canUpload && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="field-label">Day</span>
            <input
              type="date"
              className="form-control w-auto"
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              value={date || viewDate}
              onChange={(event) => onDateChange(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">USB file</span>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsm,.csv,.txt,.log"
              className="form-control"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {notice && <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      <label className="block">
        <span className="field-label">Find a name</span>
        <input
          type="search"
          className="form-control"
          placeholder="Jesse, Hayatu, PIN…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="space-y-3">
        {visibleRows.map((row) => {
          const person = crew.find((item) => item.staffId && item.staffId === row.staffId);
          const times = row.times?.length
            ? row.times
            : [
                { at: row.firstIn, type: "in" },
                ...(row.lastOut !== row.firstIn ? [{ at: row.lastOut, type: "out" }] : [])
              ];
          const timeIn = times[0]?.at ?? row.firstIn;
          const timeOut = times.length > 1 ? times[times.length - 1].at : "";
          const shift = hoursBetween(timeIn, timeOut);
          return (
            <article key={row.key} className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <Face name={row.name} photoUrl={person?.photoUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-950">{row.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {date ? `${weekdayName(date)} · ${formatDay(date)}` : ""}
                        {row.staffNumber ? ` · ${row.staffNumber}` : ` · PIN ${row.devicePin}`}
                        {row.jobTitle ? ` · ${row.jobTitle}` : ""}
                      </p>
                    </div>
                    <span className={`pill ${row.matched ? "bg-green-50 text-green-800 ring-green-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                      {row.matched ? "Present" : row.suggestions?.length ? "Probable" : "Not on register"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-emerald-50 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">Time in</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{formatTime(timeIn)}</p>
                    </div>
                    <div className={`rounded-2xl px-3 py-2.5 ${timeOut ? "bg-slate-950 text-white" : dayEnded ? "bg-amber-50" : "bg-slate-100"}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${timeOut ? "text-slate-300" : dayEnded ? "text-amber-800" : "text-slate-500"}`}>
                        Time out
                      </p>
                      <p className={`mt-1 text-lg font-semibold ${timeOut ? "tabular-nums text-white" : dayEnded ? "text-amber-950" : "text-slate-400"}`}>
                        {timeOut ? formatTime(timeOut) : dayEnded ? "Didn't check-out" : "Still on site"}
                      </p>
                    </div>
                  </div>
                  {shift ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {shift}
                      {times.length > 2 ? ` · ${times.length - 2} other punch${times.length - 2 === 1 ? "" : "es"}` : ""}
                    </p>
                  ) : null}
                  {!row.matched && canLink && (row.suggestions?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.suggestions?.map((item) => (
                        <button
                          key={item.staffId}
                          type="button"
                          disabled={busy}
                          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-left text-xs font-semibold text-blue-900"
                          onClick={() => onLink(row.devicePin, item.staffId)}
                        >
                          {item.name}
                          <span className="block font-normal text-blue-700">{item.reason}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!row.matched && canLink && (
                    <select
                      className="form-control mt-3"
                      defaultValue=""
                      disabled={busy}
                      onChange={(event) => {
                        const staffId = event.target.value;
                        if (staffId) onLink(row.devicePin, staffId);
                      }}
                    >
                      <option value="">Or pick from the register…</option>
                      {crew.map((member) =>
                        member.staffId ? (
                          <option key={member.staffId} value={member.staffId}>
                            {member.fullName}
                            {member.staffNumber ? ` · ${member.staffNumber}` : ""}
                          </option>
                        ) : null
                      )}
                    </select>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!visibleRows.length && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            {needle
              ? `No one named “${query.trim()}” on this day.`
              : missingDay
                ? `${weekdayName(date)} ${formatDay(date)} is missing. Upload the F16 file to fill this day.`
                : date > today
                  ? `${weekdayName(date)} has not come yet.`
                  : "Upload the F16 Excel or Glog after the close of work."}
          </p>
        )}
      </div>

      {imports.length > 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-800">Uploads kept</p>
          <p className="mt-1 text-sm text-slate-600">Every USB file stays here so Admin and the Executive Director can open an earlier month.</p>
          <div className="mt-3 space-y-2">
            {imports.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-left"
                onClick={() => item.lastDay && onDateChange(item.lastDay)}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{item.fileName}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatWhen(item.createdAt)}
                    {item.uploadedBy ? ` · ${item.uploadedBy}` : ""}
                    {item.firstDay && item.lastDay
                      ? ` · ${formatDay(item.firstDay)}${item.firstDay !== item.lastDay ? `–${formatDay(item.lastDay)}` : ""}`
                      : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs font-semibold text-slate-700">{item.rowCount} punches</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
