"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { DepartmentRow } from "@/lib/ims/data";
import { isConstructionDepartment } from "@/lib/ims/service";
import { ListLoader } from "@/app/components/list-loader";
import {
  ConstructionAttendance,
  type AttendanceDay,
  type AttendanceImport,
  type AttendanceLogRow
} from "@/app/components/construction-attendance";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

export type ConstructionDeskReport = {
  id: string;
  submittedBy: string;
  date: string;
  status: string;
  summary: string;
  departmentUpdate?: string;
  currentProjects?: string;
  upcomingProjects?: string;
  jobsCompleted?: string;
  jobsInProgress?: string;
  challenges?: string;
  equipmentStatus?: string[];
  attendance?: number;
  revenue?: number;
  cashIn?: number;
  expenses?: number;
};

type CrewMember = {
  id: string;
  staffId?: string | null;
  fullName: string;
  preferredName?: string | null;
  staffNumber?: string | null;
  jobTitle?: string | null;
  roleOnSite?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  hasLogin?: boolean;
};

type AttendanceRow = AttendanceLogRow;

type TabId = "review" | "crew" | "file" | "attendance";
type ReportFilter = "waiting" | "today" | "returned" | "all";

function nameKey(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

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
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatNaira(value: number) {
  return `NGN ${value.toLocaleString("en-NG")}`;
}

function statusCopy(status: string) {
  if (status === "Pending Chairman Review") return "Waiting";
  return status;
}

function statusClass(status: string) {
  if (status === "Approved") return "bg-green-50 text-green-800 ring-green-200";
  if (status === "Returned") return "bg-red-50 text-red-800 ring-red-200";
  if (status === "Pending Chairman Review") return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function Face({
  name,
  photoUrl,
  size = "md"
}: {
  name?: string | null;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-[4.5rem] w-[4.5rem]" : size === "sm" ? "h-10 w-10" : "h-14 w-14";
  const text = size === "lg" ? "text-lg" : size === "sm" ? "text-xs" : "text-sm";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photoUrl} alt="" className={`${dim} shrink-0 rounded-2xl object-cover ring-1 ring-slate-200`} />
    );
  }
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-2xl bg-blue-50 font-bold text-blue-800 ring-1 ring-blue-100 ${text}`}
    >
      {initials(name)}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-slate-950">{value}</p>
    </div>
  );
}

export function ConstructionOffice({
  departments,
  departmentId,
  reports = [],
  canReview = false,
  canSubmit = false,
  myDesk = "",
  children,
  projectManagerForm,
  onOpenReport,
  onApprove,
  onReturn
}: {
  departments: DepartmentRow[];
  departmentId?: string;
  reports?: ConstructionDeskReport[];
  canReview?: boolean;
  canSubmit?: boolean;
  myDesk?: string;
  children?: ReactNode;
  projectManagerForm?: ReactNode;
  onOpenReport?: (id: string) => void;
  onApprove?: (id: string) => void;
  onReturn?: (id: string) => void;
}) {
  const constructionDepartments = departments.filter((item) => isConstructionDepartment(item));
  const [chosen, setChosen] = useState(
    departmentId && constructionDepartments.some((item) => item.id === departmentId)
      ? departmentId
      : constructionDepartments[0]?.id ?? departmentId ?? ""
  );
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState("");
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [site, setSite] = useState(constructionDepartments.length > 0);
  const [error, setError] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>(canReview ? "attendance" : canSubmit ? "file" : "crew");
  const [filter, setFilter] = useState<ReportFilter>(canReview ? "waiting" : "all");
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceDays, setAttendanceDays] = useState<AttendanceDay[]>([]);
  const [attendanceImports, setAttendanceImports] = useState<AttendanceImport[]>([]);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceNotice, setAttendanceNotice] = useState("");
  const [desk, setDesk] = useState(myDesk);

  useEffect(() => {
    if (!chosen && constructionDepartments[0]?.id) setChosen(constructionDepartments[0].id);
  }, [chosen, constructionDepartments]);

  async function load(id: string, selectedProject?: string) {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers = await authHeaders();
    const params = new URLSearchParams({ departmentId: id });
    if (selectedProject) params.set("projectId", selectedProject);
    const response = await fetch(`/api/construction?${params.toString()}`, { headers });
    const payload = await response.json();
    if (!response.ok && payload.site === false) {
      setSite(false);
      setProjects([]);
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Failed to load Jalingo Road Construction");
    setSite(Boolean(payload.site));
    setNeedsMigration(Boolean(payload.needsMigration));
    setProjects(payload.projects ?? []);
    setProjectId(payload.projectId ?? payload.projects?.[0]?.id ?? "");
    setCrew(payload.crew ?? []);
    if (payload.myDesk) setDesk(payload.myDesk);
  }

  async function loadAttendance(id: string, date?: string) {
    if (!id) return;
    const headers = await authHeaders();
    const params = new URLSearchParams({ departmentId: id });
    if (date) params.set("date", date);
    const response = await fetch(`/api/attendance?${params.toString()}`, { headers });
    const payload = await response.json();
    if (!response.ok && payload.needsMigration) {
      setNeedsMigration(true);
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Failed to load attendance");
    setAttendance(payload.roll ?? []);
    setAttendanceDays(payload.days ?? []);
    setAttendanceImports(payload.imports ?? []);
    if (!date && payload.date) setAttendanceDate(payload.date);
  }

  useEffect(() => {
    load(chosen, projectId || undefined)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [chosen]);

  useEffect(() => {
    if (!chosen) return;
    loadAttendance(chosen, attendanceDate).catch((err) => setError(err instanceof Error ? err.message : "Failed to load attendance"));
  }, [chosen, attendanceDate]);

  const project = projects.find((item) => item.id === projectId) ?? projects[0];
  const today = new Date().toISOString().slice(0, 10);

  const crewIndex = useMemo(() => {
    const map = new Map<string, CrewMember>();
    for (const person of crew) {
      map.set(nameKey(person.fullName), person);
      if (person.preferredName) map.set(nameKey(person.preferredName), person);
    }
    return map;
  }, [crew]);

  function personFor(name: string) {
    return crewIndex.get(nameKey(name));
  }

  const waiting = reports.filter((item) => item.status === "Pending Chairman Review");
  const todayReports = reports.filter((item) => item.date === today);
  const returned = reports.filter((item) => item.status === "Returned");
  const todaySpend = todayReports.reduce((sum, item) => sum + (item.expenses ?? 0), 0);
  const todayBilled = todayReports.reduce((sum, item) => sum + (item.revenue ?? 0), 0);
  const todayCollected = todayReports.reduce((sum, item) => sum + (item.cashIn ?? 0), 0);
  const workToday = Array.from(new Set(todayReports.map((item) => item.jobsCompleted).filter(Boolean)));

  const missingToday = crew.filter((person) => {
    const names = [nameKey(person.fullName), nameKey(person.preferredName)].filter(Boolean);
    return !todayReports.some((report) => names.includes(nameKey(report.submittedBy)));
  });

  const latestByCrew = useMemo(() => {
    const map = new Map<string, ConstructionDeskReport>();
    for (const report of reports) {
      const key = nameKey(report.submittedBy);
      if (!map.has(key)) map.set(key, report);
    }
    return map;
  }, [reports]);

  const sortedCrew = useMemo(() => {
    return [...crew].sort((a, b) => {
      const aLatest = latestByCrew.get(nameKey(a.fullName)) ?? latestByCrew.get(nameKey(a.preferredName));
      const bLatest = latestByCrew.get(nameKey(b.fullName)) ?? latestByCrew.get(nameKey(b.preferredName));
      const rank = (person: CrewMember, latest?: ConstructionDeskReport) => {
        if (latest?.status === "Pending Chairman Review" && latest.date === today) return 0;
        if (person.hasLogin && !latest) return 1;
        if (!latest || latest.date !== today) return 2;
        return 3;
      };
      const diff = rank(a, aLatest) - rank(b, bLatest);
      if (diff) return diff;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [crew, latestByCrew, today]);

  const visibleReports = useMemo(() => {
    const rows =
      filter === "waiting"
        ? waiting
        : filter === "today"
          ? todayReports
          : filter === "returned"
            ? returned
            : reports;
    return [...rows].sort((a, b) => {
      const wait = Number(b.status === "Pending Chairman Review") - Number(a.status === "Pending Chairman Review");
      if (wait) return wait;
      return b.date.localeCompare(a.date) || a.submittedBy.localeCompare(b.submittedBy);
    });
  }, [filter, waiting, todayReports, returned, reports]);

  const presentToday = attendance.filter((item) => item.matched).length;

  async function uploadAttendance(file: File) {
    setAttendanceBusy(true);
    setError("");
    setAttendanceNotice("");
    try {
      const headers = await authHeaders();
      const body = new FormData();
      body.append("file", file);
      body.append("departmentId", chosen);
      if (project?.id) body.append("projectId", project.id);
      const response = await fetch("/api/attendance", { method: "POST", headers, body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not read that file");
      const pending = payload.unmatchedPeople ?? [];
      const probable = pending.filter((item: { suggestions?: unknown[] }) => item.suggestions?.length).length;
      setAttendanceNotice(
        pending.length
          ? `${payload.matchedPeople ?? payload.matched} people matched. ${probable} have a probable name on the register. Confirm them on the log.`
          : `${payload.matchedPeople ?? payload.matched} people matched.`
      );
      await loadAttendance(chosen, attendanceDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload attendance");
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function linkPin(devicePin: string, staffId: string) {
    setAttendanceBusy(true);
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/attendance/link", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: chosen, devicePin, staffId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not link that PIN");
      setAttendanceNotice(`${payload.name} is now PIN ${devicePin} on the F16.`);
      await loadAttendance(chosen, attendanceDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link that PIN");
    } finally {
      setAttendanceBusy(false);
    }
  }

  const tabs = (
    [
      { id: "attendance" as const, label: "Clock", count: attendance.length || presentToday },
      { id: "review" as const, label: "Reports", count: waiting.length },
      { id: "crew" as const, label: "Crew", count: crew.length },
      { id: "file" as const, label: "File report", count: undefined as number | undefined }
    ] as const
  ).filter((item) => item.id !== "file" || canSubmit);

  return (
    <div className="space-y-4">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Construction</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Jalingo Road Construction</h2>
      </div>

      {needsMigration && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Run the Construction SQL in Supabase if the site book is empty, and{" "}
          <span className="font-semibold">supabase/migrations/202610310001_attendance_usb.sql</span> for USB attendance,
          then refresh.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {constructionDepartments.length > 1 && (
        <select className="form-control w-full sm:max-w-md" value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {constructionDepartments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.subsidiaryName ? `${item.subsidiaryName} · ` : ""}
              {item.name}
            </option>
          ))}
        </select>
      )}
      {!site && <p className="text-sm text-slate-600">This desk is only for Construction.</p>}
      {site && loading && <ListLoader label="Loading Jalingo…" variant="cards" />}
      {site && !loading && !project && (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          No construction project is open yet.
        </p>
      )}
      {site && !loading && project && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Pulse label="Waiting" value={String(waiting.length)} tone={waiting.length ? "amber" : "slate"} />
            <Pulse label="Filed today" value={String(todayReports.length)} tone="blue" />
            <Pulse label="Crew" value={String(crew.length)} tone="slate" />
            <Pulse label="Spend today" value={formatNaira(todaySpend)} tone="green" />
          </section>

          {(todayReports.length > 0 || todayBilled > 0 || todayCollected > 0) && (
            <p className="text-sm text-slate-600">
              {workToday.length ? <span className="font-semibold text-slate-950">{workToday.join(" · ")}</span> : "Reports in"}
              {todayBilled ? ` · billed ${formatNaira(todayBilled)}` : ""}
              {todayCollected ? ` · collected ${formatNaira(todayCollected)}` : ""}
              {missingToday.length ? ` · ${missingToday.length} of the crew have not filed today` : ""}
            </p>
          )}

          <div className="sticky top-0 z-10 -mx-3 bg-white/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
            <div className={`grid gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1 ${tabs.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`min-h-11 rounded-xl px-2 py-2 text-sm font-semibold ${
                    tab === item.id ? "bg-blue-800 text-white shadow-sm" : "text-slate-600"
                  }`}
                >
                  {item.label}
                  {typeof item.count === "number" ? ` ${item.count}` : ""}
                </button>
              ))}
            </div>
          </div>

          {tab === "review" && (
            <section className="space-y-3">
              {attendanceDays.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab("attendance")}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-900 bg-slate-950 px-4 py-3 text-left text-white"
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200">F16 clock</p>
                    <p className="mt-1 text-sm font-semibold">
                      {attendance.length} on the machine
                      {attendanceDate ? ` · ${formatDay(attendanceDate)}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-blue-100">Open log</span>
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["waiting", `Waiting ${waiting.length}`],
                    ["today", `Today ${todayReports.length}`],
                    ["returned", `Returned ${returned.length}`],
                    ["all", `All ${reports.length}`]
                  ] as Array<[ReportFilter, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${
                      filter === id ? "bg-blue-800 text-white ring-blue-800" : "bg-white text-slate-600 ring-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {canReview && missingToday.length > 0 && filter === "waiting" && (
                <button
                  type="button"
                  onClick={() => setTab("crew")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left"
                >
                  <div className="flex -space-x-2">
                    {missingToday.slice(0, 5).map((person) => (
                      <div key={person.id} className="ring-2 ring-white">
                        <Face name={person.fullName} photoUrl={person.photoUrl} size="sm" />
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold text-slate-950">{missingToday.length} not filed today.</span> Open
                    crew to see who.
                  </p>
                </button>
              )}

              {visibleReports.map((item) => {
                const person = personFor(item.submittedBy);
                const waitingOnYou = canReview && item.status === "Pending Chairman Review";
                return (
                  <article
                    key={item.id}
                    className={`rounded-3xl border bg-white p-4 ${
                      waitingOnYou ? "border-amber-200" : item.status === "Returned" ? "border-red-200" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Face name={item.submittedBy} photoUrl={person?.photoUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-950">{item.submittedBy}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {person?.roleOnSite || person?.jobTitle || "Construction"}
                              {` · ${formatDay(item.date)}`}
                            </p>
                          </div>
                          <span className={`pill ${statusClass(item.status)}`}>{statusCopy(item.status)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Fact label="Work done" value={item.jobsCompleted} />
                      <Fact label="Report said" value={item.attendance != null ? `${item.attendance} on site` : null} />
                      <Fact label="Billed" value={item.revenue ? formatNaira(item.revenue) : null} />
                      <Fact label="Collected" value={item.cashIn ? formatNaira(item.cashIn) : null} />
                      <Fact label="Site spend" value={item.expenses ? formatNaira(item.expenses) : null} />
                      <Fact label="Still running" value={item.jobsInProgress} />
                    </div>

                    {item.equipmentStatus?.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {item.equipmentStatus.map((plant) => (
                          <span key={plant} className="pill bg-slate-100 text-slate-700 ring-slate-200">
                            {plant}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {item.departmentUpdate || item.currentProjects || item.summary}
                    </p>
                    {item.challenges && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        <span className="font-semibold">Delay / support: </span>
                        {item.challenges}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {onOpenReport && (
                        <button type="button" className="secondary-button" onClick={() => onOpenReport(item.id)}>
                          Full report
                        </button>
                      )}
                      {waitingOnYou && onApprove && (
                        <button type="button" className="primary-button" onClick={() => onApprove(item.id)}>
                          Approve
                        </button>
                      )}
                      {waitingOnYou && onReturn && (
                        <button type="button" className="secondary-button" onClick={() => onReturn(item.id)}>
                          Return
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}

              {!visibleReports.length && (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
                  <p className="text-sm text-slate-500">
                    {filter === "waiting"
                      ? "Nothing waiting. Filed reports stay under Today and All."
                      : "No report in this view yet."}
                  </p>
                  {canSubmit && (
                    <button type="button" className="primary-button mt-4" onClick={() => setTab("file")}>
                      File today’s report
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === "crew" && (
            <section className="space-y-3">
              <p className="text-sm text-slate-600">
                {crew.length} on the Jalingo register
                {missingToday.length ? ` · ${missingToday.length} have not filed today` : ""}.
                Photos come from the staff passport on file.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {sortedCrew.map((person) => {
                  const latest =
                    latestByCrew.get(nameKey(person.fullName)) ?? latestByCrew.get(nameKey(person.preferredName));
                  const filedToday = latest?.date === today;
                  const role = person.roleOnSite || person.jobTitle || "Construction";
                  return (
                    <article key={person.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <Face name={person.fullName} photoUrl={person.photoUrl} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-5 text-slate-950">{person.fullName}</p>
                          <p className="mt-1 text-sm text-slate-600">{role}</p>
                          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {person.staffNumber || "Staff ID pending"}
                          </p>
                          <div className="mt-2">
                            {filedToday ? (
                              <span className={`pill ${statusClass(latest?.status ?? "Draft")}`}>
                                {latest?.status === "Pending Chairman Review"
                                  ? "Filed · waiting"
                                  : `Filed · ${statusCopy(latest?.status ?? "")}`}
                              </span>
                            ) : person.hasLogin ? (
                              <span className="pill bg-amber-50 text-amber-800 ring-amber-200">No report today</span>
                            ) : (
                              <span className="pill bg-slate-100 text-slate-600 ring-slate-200">On crew</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {latest && (
                        <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">
                          {formatDay(latest.date)} · {latest.jobsCompleted || latest.departmentUpdate || latest.summary}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {person.phone && (
                          <a href={`tel:${String(person.phone).replace(/\s+/g, "")}`} className="secondary-button">
                            Call
                          </a>
                        )}
                        {latest && onOpenReport && (
                          <button type="button" className="secondary-button" onClick={() => onOpenReport(latest.id)}>
                            Latest report
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {!crew.length && (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                  No one is assigned yet. Construction staff are added to this job when they are registered.
                </p>
              )}
            </section>
          )}

          {tab === "attendance" && (
            <ConstructionAttendance
              date={attendanceDate}
              days={attendanceDays}
              imports={attendanceImports}
              rows={attendance}
              crew={crew}
              busy={attendanceBusy}
              notice={attendanceNotice}
              canUpload={canSubmit}
              canLink={canSubmit}
              onDateChange={setAttendanceDate}
              onUpload={(file) => void uploadAttendance(file)}
              onLink={(devicePin, staffId) => void linkPin(devicePin, staffId)}
            />
          )}

          {tab === "file" && canSubmit && (
            <div className="pt-1">{desk === "project_manager" && projectManagerForm ? projectManagerForm : children}</div>
          )}
        </>
      )}
    </div>
  );
}

function Pulse({ label, value, tone }: { label: string; value: string; tone: "amber" | "blue" | "green" | "slate" }) {
  const color =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "blue"
        ? "border-blue-100 bg-blue-50"
        : tone === "green"
          ? "border-emerald-100 bg-emerald-50"
          : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border px-3 py-3 ${color}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
