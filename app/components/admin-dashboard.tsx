"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type StaffPerson = {
  id: string;
  full_name: string;
  staff_number: string;
  job_title: string;
  start_date: string;
  status: string;
  updated_at?: string;
  departments?: { name?: string; subsidiaries?: { name?: string } | Array<{ name?: string }> | null } | null;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  staff?: { full_name?: string; staff_number?: string } | null;
};

type LetterRow = {
  id: string;
  letter_type: string;
  reference_number: string;
  issued_at: string;
  storage_path?: string | null;
  staff?: { full_name?: string; staff_number?: string } | null;
};

type KpiBrief = {
  id: string;
  measure: string;
  target_value: number;
  unit: string;
  period_start: string;
  period_end: string;
  actual_value: number | null;
  subsidiaries?: { name?: string } | Array<{ name?: string }> | null;
  departments?: { name?: string } | Array<{ name?: string }> | null;
};

type ReportRow = {
  id: string;
  department: string;
  subsidiary?: string;
  date: string;
  status: string;
  submittedBy: string;
};

const leftService = new Set(["resigned", "retired", "dismissed"]);
const issueLetters = new Set(["query", "warning", "suspension"]);

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mondayOf(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = copy.getDay();
  const back = weekday === 0 ? 6 : weekday - 1;
  copy.setDate(copy.getDate() - back);
  return copy;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function subsidiaryName(department?: StaffPerson["departments"]) {
  const nested = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
  return nested?.name;
}

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

export function AdminDashboard({
  reports,
  onOpen
}: {
  reports: ReportRow[];
  onOpen: (page: "Staff Register" | "Leave" | "Letters" | "Directorate KPIs") => void;
}) {
  const [staff, setStaff] = useState<StaffPerson[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [kpis, setKpis] = useState<KpiBrief[]>([]);
  const [error, setError] = useState("");
  const today = new Date();
  const weekStart = isoDate(mondayOf(today));
  const todayIso = isoDate(today);
  const weekLabel = mondayOf(today).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headers = await authHeaders();
        const [staffResponse, leaveResponse, letterResponse, kpiResponse] = await Promise.all([
          fetch("/api/staff", { headers }),
          fetch("/api/leave", { headers }),
          fetch("/api/letters", { headers }),
          fetch("/api/kpis", { headers })
        ]);
        const [staffPayload, leavePayload, letterPayload, kpiPayload] = await Promise.all([
          staffResponse.json(),
          leaveResponse.json(),
          letterResponse.json(),
          kpiResponse.json()
        ]);
        if (!staffResponse.ok) throw new Error(staffPayload.error || "Failed to load staff");
        if (!leaveResponse.ok) throw new Error(leavePayload.error || "Failed to load leave");
        if (!letterResponse.ok) throw new Error(letterPayload.error || "Failed to load letters");
        if (cancelled) return;
        setStaff(staffPayload.staff ?? []);
        setLeave(leavePayload.requests ?? []);
        setLetters(letterPayload.letters ?? []);
        if (kpiResponse.ok) setKpis(kpiPayload.kpis ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the briefing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = staff.filter((person) => !leftService.has(person.status));
  const starters = active.filter((person) => person.start_date >= weekStart && person.start_date <= todayIso);
  const exits = staff.filter((person) => leftService.has(person.status) && (person.updated_at ?? "").slice(0, 10) >= weekStart);
  const onLeave = leave.filter((request) => request.status === "approved" && request.start_date <= todayIso && request.end_date >= todayIso);
  const pendingLeave = leave.filter((request) => request.status.startsWith("pending"));
  const hisApprovals = leave.filter((request) => request.status === "pending_director_of_administration");
  const issueRows = letters.filter((letter) => issueLetters.has(letter.letter_type) && letter.issued_at.slice(0, 10) >= weekStart);
  const suspended = active.filter((person) => person.status === "suspended");
  const unfiled = letters.filter((letter) => !letter.storage_path);
  const weekReports = reports.filter((report) => report.date >= weekStart && report.date <= todayIso && report.status !== "Draft");
  const pendingReports = reports.filter((report) => report.status === "Pending Chairman Review");
  const returnedReports = reports.filter((report) => report.status === "Returned");

  const subsidiaryNames = Array.from(new Set(weekReports.map((report) => report.subsidiary || report.department)));
  const currentKpis = kpis.filter((kpi) => kpi.period_start <= todayIso && kpi.period_end >= todayIso);

  function kpiLine(kpi: KpiBrief) {
    const subsidiary = Array.isArray(kpi.subsidiaries) ? kpi.subsidiaries[0]?.name : kpi.subsidiaries?.name;
    const department = Array.isArray(kpi.departments) ? kpi.departments[0]?.name : kpi.departments?.name;
    const target = `${Number(kpi.target_value).toLocaleString("en-NG")}${kpi.unit ? ` ${kpi.unit}` : ""}`;
    const result = kpi.actual_value == null ? "result not entered" : `${Number(kpi.actual_value).toLocaleString("en-NG")}${kpi.unit ? ` ${kpi.unit}` : ""}`;
    return `${subsidiary ?? "Subsidiary"}${department ? ` · ${department}` : ""} · ${kpi.measure} · target ${target} · ${result}`;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Director of Administration</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Monday briefing</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Week of {weekLabel}. People, leave, letters, reports, and directorate targets below are live. Attendance, vacancies, policies, and training are not on a register yet, so those lines stay blank.
        </p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Section title="People" subtitle="Headcount and movement since Monday.">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Count label="Total staff" value={String(active.length)} onClick={() => onOpen("Staff Register")} />
          <Count label="New staff" value={String(starters.length)} onClick={() => onOpen("Staff Register")} />
          <Count label="Exits" value={String(exits.length)} onClick={() => onOpen("Staff Register")} />
          <Count label="Leave" value={String(onLeave.length)} detail={`${pendingLeave.length} waiting`} onClick={() => onOpen("Leave")} />
          <Blank label="Attendance" detail="Clock-in is not connected yet." />
          <Blank label="Vacancies" detail="No vacancy register yet." />
          <Count label="Staff issues" value={String(suspended.length + issueRows.length)} />
        </div>
        <NameList
          title="New this week"
          rows={starters.map((person) => `${person.full_name} · ${person.job_title}`)}
          empty="No one started this week."
        />
        <NameList
          title="Left this week"
          rows={exits.map((person) => `${person.full_name} · ${titleCase(person.status)}`)}
          empty="No exits this week."
        />
        <NameList
          title="On leave today"
          rows={onLeave.map((request) => `${request.staff?.full_name ?? "Staff"} · ${titleCase(request.leave_type)} until ${request.end_date}`)}
          empty="No one is on approved leave today."
        />
        <NameList
          title="Staff issues"
          rows={[
            ...suspended.map((person) => `${person.full_name} · Suspended${subsidiaryName(person.departments) ? ` · ${subsidiaryName(person.departments)}` : ""}`),
            ...issueRows.map((letter) => `${letter.staff?.full_name ?? "Staff"} · ${titleCase(letter.letter_type)} · ${letter.reference_number}`)
          ]}
          empty="No suspended staff, and no query, warning, or suspension letter this week."
        />
      </Section>

      <Section title="Performance" subtitle="Reports received this week, by subsidiary.">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Count
            label="Directorate KPIs"
            value={currentKpis.length ? `${currentKpis.filter((kpi) => kpi.actual_value != null).length}/${currentKpis.length}` : "0"}
            detail={currentKpis.length ? "results entered" : "No target is in force"}
            onClick={() => onOpen("Directorate KPIs")}
          />
          <Count label="Subsidiary performance" value={String(subsidiaryNames.length)} detail="subsidiaries with a report" />
          <Count label="Pending reports" value={String(pendingReports.length)} />
          <Count label="Outstanding actions" value={String(returnedReports.length + hisApprovals.length)} />
        </div>
        {subsidiaryNames.length ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Subsidiary</th>
                  <th className="px-4 py-3">Reports</th>
                  <th className="px-4 py-3">Approved</th>
                  <th className="px-4 py-3">Still open</th>
                </tr>
              </thead>
              <tbody>
                {subsidiaryNames.map((name) => {
                  const rows = weekReports.filter((report) => (report.subsidiary || report.department) === name);
                  const approved = rows.filter((report) => report.status === "Approved").length;
                  return (
                    <tr key={name} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-950">{name}</td>
                      <td className="px-4 py-3">{rows.length}</td>
                      <td className="px-4 py-3">{approved}</td>
                      <td className="px-4 py-3">{rows.length - approved}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No submitted reports are visible for this week.</p>
        )}
        <NameList
          title="Targets in force"
          rows={currentKpis.map(kpiLine)}
          empty="No directorate target covers today. Set one under Directorate KPIs."
        />
        <NameList
          title="Pending reports"
          rows={pendingReports.map((report) => `${report.subsidiary ? `${report.subsidiary} · ` : ""}${report.department} · ${report.date} · ${report.submittedBy}`)}
          empty="Nothing is waiting on the Chairman."
        />
        <NameList
          title="Returned reports"
          rows={returnedReports.map((report) => `${report.department} · ${report.date}`)}
          empty="No report has been sent back."
        />
      </Section>

      <Section title="Administration" subtitle="Letters and decisions sitting with this office.">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Count label="Pending correspondence" value={String(unfiled.length)} detail="letter copies not on the file" onClick={() => onOpen("Letters")} />
          <Count label="Approvals" value={String(hisApprovals.length)} detail="leave waiting for you" onClick={() => onOpen("Leave")} />
          <Blank label="Policies under development" detail="No policy register yet." />
          <Count label="Outstanding administrative issues" value={String(hisApprovals.length + unfiled.length + returnedReports.length)} />
        </div>
        <NameList
          title="Letters without a stored copy"
          rows={unfiled.slice(0, 8).map((letter) => `${letter.reference_number} · ${titleCase(letter.letter_type)} · ${letter.staff?.full_name ?? "Staff"}`)}
          empty="Every issued letter has a copy on the file, or none have been issued."
        />
        <NameList
          title="Leave waiting for the Director of Administration"
          rows={hisApprovals.map((request) => `${request.staff?.full_name ?? "Staff"} · ${titleCase(request.leave_type)} · ${request.start_date} to ${request.end_date}`)}
          empty="No leave request is at your stage."
        />
      </Section>

      <Section title="Training" subtitle="These registers are not open yet.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Blank label="Upcoming training" detail="Nothing is scheduled." />
          <Blank label="Staff development needs" detail="No needs are recorded." />
          <Blank label="Leadership development" detail="No programme is recorded." />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Count({
  label,
  value,
  detail,
  onClick
}: {
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      {detail && <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>}
    </>
  );
  if (!onClick) return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">{body}</div>;
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50">
      {body}
    </button>
  );
}

function Blank({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}

function NameList({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
      {rows.length ? (
        <ul className="mt-2 space-y-1 text-sm text-slate-800">
          {rows.map((row, index) => (
            <li key={`${row}-${index}`}>{row}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  );
}
