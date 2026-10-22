"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { fetchDepartments, type DepartmentRow } from "@/lib/ims/data";
import { clampLeaveEndDate, leaveDateWindow, leaveRules, type LeaveCode } from "@/lib/ims/leave-rules";
import { groupBySubsidiary, SubsidiaryDepartmentFields } from "@/app/components/org-select";
import { matchesIdentity, type SharedIdGroup } from "@/lib/ims/identity";
import { ListLoader } from "@/app/components/list-loader";

type PeoplePage = "Staff Register" | "Staff Applications" | "Leave" | "Letters";

type StaffDepartment = {
  id: string;
  name: string;
  code: string | null;
  subsidiaries?: { name: string } | Array<{ name: string }> | null;
};

function departmentLabel(department?: StaffDepartment | null) {
  if (!department) return "";
  const nested = Array.isArray(department.subsidiaries) ? department.subsidiaries[0] : department.subsidiaries;
  return nested?.name ? `${nested.name} · ${department.name}` : department.name;
}

type StaffRow = {
  id: string;
  staff_number: string;
  full_name: string;
  preferred_name?: string | null;
  job_title: string;
  phone: string;
  personal_email: string;
  work_email?: string | null;
  start_date: string;
  status: string;
  date_of_birth: string;
  sex: string;
  nationality?: string | null;
  home_address: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  government_id_type?: string | null;
  government_id_number?: string | null;
  nin?: string | null;
  bvn?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  annual_leave_days: number;
  photoUrl?: string | null;
  departments?: StaffDepartment | null;
};

const statuses = [
  "permanent",
  "contract",
  "consultant",
  "probation",
  "nysc",
  "intern",
  "suspended",
  "resigned",
  "retired",
  "dismissed"
];

const docTypes = [
  ["employment_letter", "Employment letter"],
  ["confirmation_letter", "Confirmation letter"],
  ["certificates", "Certificates"],
  ["government_id", "Government identity card"],
  ["passport_photograph", "Passport photograph"],
  ["next_of_kin", "Next-of-kin form"],
  ["guarantor", "Guarantor form"],
  ["posting_letter", "Posting or transfer letter"],
  ["cv", "CV"],
  ["salary_slip", "Salary slip"]
];

const letterTypes = ["offer", "promotion", "transfer", "query", "warning", "suspension", "termination"];

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function PeopleOffice({
  page,
  role,
  canWritePeople,
  canApproveLeave,
  subsidiaryId
}: {
  page: PeoplePage;
  role: string;
  canWritePeople: boolean;
  canApproveLeave: boolean;
  subsidiaryId?: string;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [canReviewApplications, setCanReviewApplications] = useState(false);
  const [sharedIds, setSharedIds] = useState<SharedIdGroup[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const headers = await authHeaders();
    const [staffResponse, departmentRows] = await Promise.all([
      fetch("/api/staff", { headers }),
      fetchDepartments()
    ]);
    const staffPayload = await staffResponse.json();
    if (!staffResponse.ok) throw new Error(staffPayload.error || "Failed to load staff");
    setStaff(staffPayload.staff ?? []);
    setSharedIds(staffPayload.sharedIds ?? []);
    setDepartments(
      subsidiaryId ? departmentRows.filter((item) => item.subsidiaryId === subsidiaryId) : departmentRows
    );

    if (page === "Letters") {
      const response = await fetch("/api/letters", { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load letters");
      setLetters(payload.letters ?? []);
    }
    if (page === "Leave") {
      const response = await fetch("/api/leave", { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load leave");
      setRequests(payload.requests ?? []);
    }
    if (page === "Staff Applications") {
      const response = await fetch("/api/apply/review", { headers });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load applications");
      setApplications(payload.applications ?? []);
      setCanReviewApplications(Boolean(payload.canReview));
    }
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [page, subsidiaryId]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">People</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{page}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {page === "Staff Applications"
            ? "Public submissions from /apply. HR and Director of Administration verify records. Staff ID is issued only on approval."
            : page === "Staff Register"
              ? role === "executive-director"
                ? "Verified staff in your subsidiary only. Click a name for identity details. Shared government IDs are flagged at the top."
                : "Every verified staff record. Click a name for identity details. Shared government IDs are flagged at the top."
              : page === "Leave"
                ? role === "executive-director"
                  ? "Leave from staff in your subsidiary waits here first. Approve to send it to the Director of Administration, or refuse it."
                  : "Leave waits on the Executive Director first, then the Director of Administration."
                : "Staff numbers use the department and the year, for example TAN/EMP/ICT/2026/001. A number can be given to a new employee after the previous holder is marked resigned, retired, or dismissed."}
        </p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
      {loading && (
        <ListLoader
          label={
            page === "Staff Register"
              ? "Loading staff…"
              : page === "Staff Applications"
                ? "Loading applications…"
                : page === "Leave"
                  ? "Loading leave…"
                  : "Loading…"
          }
          variant="table"
        />
      )}
      {!loading && page === "Staff Register" && (
        <StaffRegister
          staff={staff}
          sharedIds={sharedIds}
          departments={departments}
          canWrite={canWritePeople}
          onSaved={async (message) => {
            setNotice(message);
            setError("");
            await load();
          }}
          onError={setError}
        />
      )}
      {!loading && page === "Staff Applications" && (
        <ApplicationsPanel
          applications={applications}
          staff={staff}
          canReview={canReviewApplications}
          onSaved={async (message) => {
            setNotice(message);
            setError("");
            await load();
          }}
          onError={setError}
        />
      )}
      {!loading && page === "Letters" && (
        <LettersPanel
          staff={staff}
          departments={departments}
          letters={letters}
          canWrite={canWritePeople}
          onSaved={async (message) => {
            setNotice(message);
            setError("");
            await load();
          }}
          onError={setError}
        />
      )}
      {!loading && page === "Leave" && (
        <LeavePanel
          staff={staff}
          departments={departments}
          requests={requests}
          role={role}
          canWrite={canWritePeople}
          canApprove={canApproveLeave}
          onSaved={async (message) => {
            setNotice(message);
            setError("");
            await load();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function StaffRegister({
  staff,
  sharedIds,
  departments,
  canWrite,
  onSaved,
  onError
}: {
  staff: StaffRow[];
  sharedIds: SharedIdGroup[];
  departments: DepartmentRow[];
  canWrite: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"serving" | "all" | "left">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [docType, setDocType] = useState("cv");
  const [file, setFile] = useState<File | null>(null);
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [fileSubsidiaryId, setFileSubsidiaryId] = useState("");
  const [fileDepartmentId, setFileDepartmentId] = useState("");
  const leftService = new Set(["resigned", "retired", "dismissed"]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return staff.filter((person) => {
      const left = leftService.has(person.status);
      if (statusFilter === "serving" && left) return false;
      if (statusFilter === "left" && !left) return false;
      if (!needle) return true;
      return [
        person.full_name,
        person.preferred_name,
        person.staff_number,
        person.job_title,
        person.phone,
        person.nin,
        person.government_id_number,
        departmentLabel(person.departments)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [staff, query, statusFilter]);
  const openPerson = staff.find((person) => person.id === openId) ?? null;
  const openShares = sharedIds.filter((group) => group.people.some((item) => item.id === openId));

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to add staff");
      event.currentTarget.reset();
      setSubsidiaryId("");
      setDepartmentId("");
      const warning = payload.warning ? ` ${payload.warning}` : "";
      await onSaved(`${payload.staff.full_name} is registered as ${payload.staff.staff_number}.${warning}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add staff");
    } finally {
      setBusy(false);
    }
  }

  async function markLeft(person: StaffRow, status: string) {
    onError("");
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/staff/${person.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update staff");
      await onSaved(`${person.full_name} is marked ${status}. ${person.staff_number} can be issued again.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update staff");
    }
  }

  async function uploadFile(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !file) return;
    setBusy(true);
    onError("");
    try {
      const headers = await authHeaders();
      const body = new FormData();
      body.set("staffId", selectedId);
      body.set("docType", docType);
      body.set("file", file);
      const response = await fetch("/api/staff/documents", { method: "POST", headers, body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to store the file");
      setFile(null);
      await onSaved("The file is stored on the personnel record.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to store the file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {sharedIds.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-950">Same government-issued ID used more than once</p>
          <div className="mt-3 space-y-3">
            {sharedIds.map((group) => (
              <p key={group.key} className="text-sm text-amber-900">
                <span className="font-semibold">{group.label}</span>
                {" — "}
                {group.people
                  .map((person) => `${person.fullName}${person.staffNumber ? ` (${person.staffNumber})` : ""}`)
                  .join(" · ")}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <input
            className="form-control"
            placeholder="Search name, Staff ID, NIN, department"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["serving", `Serving (${staff.filter((person) => !leftService.has(person.status)).length})`],
            ["all", `All (${staff.length})`],
            ["left", "Left"]
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={statusFilter === id ? "primary-button" : "secondary-button"} onClick={() => setStatusFilter(id)}>
              {label}
            </button>
          ))}
          {canWrite && (
            <button type="button" className="secondary-button" onClick={() => setShowAdd((current) => !current)}>
              {showAdd ? "Hide add form" : "Add staff"}
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Showing {filtered.length} of {staff.length} records.
      </p>

      {canWrite && showAdd && (
        <form onSubmit={createStaff} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <Field label="Full name" name="fullName" required />
          <SubsidiaryDepartmentFields
            departments={departments}
            subsidiaryId={subsidiaryId}
            departmentId={departmentId}
            onSubsidiaryId={setSubsidiaryId}
            onDepartmentId={setDepartmentId}
          />
          <Field label="Job title" name="jobTitle" required />
          <Select label="Status" name="status" required options={statuses.filter((item) => !["resigned", "retired", "dismissed"].includes(item)).map((item) => [item, titleCase(item)])} />
          <Field label="Phone" name="phone" required />
          <Field label="Personal email" name="personalEmail" type="email" required />
          <Field label="Start date" name="startDate" type="date" required />
          <Field label="Date of birth" name="dateOfBirth" type="date" required />
          <Select label="Sex" name="sex" required options={[["Female", "Female"], ["Male", "Male"]]} />
          <Field label="Annual leave days (10 to 20, unpaid)" name="annualLeaveDays" type="number" defaultValue="10" required />
          <Field label="Home address" name="homeAddress" required className="md:col-span-2" />
          <Field label="Next of kin name" name="nextOfKinName" required />
          <Field label="Next of kin phone" name="nextOfKinPhone" required />
          <Field label="NIN" name="nin" />
          <Field label="Government identity number" name="governmentIdNumber" />
          <Field label="Bank account" name="bankAccount" />
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">
              {busy ? "Saving..." : "Issue staff number"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-3xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Subsidiary and department</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              {canWrite && <th className="px-4 py-3">Record</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((person) => {
              const shared = sharedIds.some((group) => group.people.some((item) => item.id === person.id));
              return (
              <tr
                key={person.id}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${shared ? "bg-amber-50" : ""}`}
                onClick={() => setOpenId(person.id)}
              >
                <td className="px-4 py-3 font-medium text-slate-950">{person.staff_number || "—"}</td>
                <td className="px-4 py-3">
                  {person.full_name}
                  {shared ? <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-amber-800">Shared ID</span> : null}
                </td>
                <td className="px-4 py-3">{departmentLabel(person.departments)}</td>
                <td className="px-4 py-3">{person.job_title}</td>
                <td className="px-4 py-3">{titleCase(person.status)}</td>
                {canWrite && (
                  <td className="px-4 py-3">
                    {["resigned", "retired", "dismissed"].includes(person.status) ? (
                      <span className="text-slate-500">Number free</span>
                    ) : (
                      <span className="flex flex-wrap gap-2">
                        {["resigned", "retired", "dismissed"].map((status) => (
                          <button
                            key={status}
                            type="button"
                            className="table-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              markLeft(person, status);
                            }}
                          >
                            {titleCase(status)}
                          </button>
                        ))}
                      </span>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-slate-500">{staff.length ? "No matching staff." : "No staff records yet."}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openPerson && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 px-3 py-3 sm:items-center" onClick={() => setOpenId(null)}>
          <section
            role="dialog"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">{openPerson.staff_number || "Staff record"}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">{openPerson.full_name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {departmentLabel(openPerson.departments)} · {titleCase(openPerson.status)}
                </p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm text-slate-700">
              {openPerson.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={openPerson.photoUrl} alt="" className="h-24 w-24 rounded-2xl object-cover" />
              )}
              <p>{openPerson.job_title}</p>
              <p>
                {openPerson.phone}
                {openPerson.personal_email ? ` · ${openPerson.personal_email}` : ""}
                {openPerson.work_email ? ` · ${openPerson.work_email}` : ""}
              </p>
              <p>
                {openPerson.sex}
                {openPerson.date_of_birth ? ` · DOB ${openPerson.date_of_birth}` : ""}
                {openPerson.nationality ? ` · ${openPerson.nationality}` : ""}
              </p>
              {openPerson.home_address && <p>{openPerson.home_address}</p>}
              <p>
                Next of kin: {openPerson.next_of_kin_name} ({openPerson.next_of_kin_phone})
              </p>
              <p>
                {openPerson.government_id_type ? `${titleCase(openPerson.government_id_type)} ` : "Government ID "}
                {openPerson.government_id_number || "not recorded"}
                {openPerson.nin ? ` · NIN ${openPerson.nin}` : ""}
                {openPerson.bvn ? ` · BVN ${openPerson.bvn}` : ""}
              </p>
              {openShares.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
                  {openShares.map((group) => (
                    <p key={group.key}>
                      {group.label} is also used by{" "}
                      {group.people
                        .filter((item) => item.id !== openPerson.id)
                        .map((item) => `${item.fullName}${item.staffNumber ? ` (${item.staffNumber})` : ""}`)
                        .join(", ")}
                      .
                    </p>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {canWrite && staff.length > 0 && (
        <form onSubmit={uploadFile} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
          <div className="md:col-span-3 grid gap-4 md:grid-cols-2">
            <SubsidiaryDepartmentFields
              departments={departments}
              subsidiaryId={fileSubsidiaryId}
              departmentId={fileDepartmentId}
              onSubsidiaryId={(id) => {
                setFileSubsidiaryId(id);
                setSelectedId("");
              }}
              onDepartmentId={(id) => {
                setFileDepartmentId(id);
                setSelectedId("");
              }}
            />
          </div>
          <label className="block">
            <span className="field-label">Staff member</span>
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="form-control" required disabled={groupBySubsidiary(departments).length > 0 && !fileDepartmentId}>
              <option value="">{groupBySubsidiary(departments).length && !fileDepartmentId ? "Select a department first" : "Select"}</option>
              {staff
                .filter((person) => (groupBySubsidiary(departments).length ? person.departments?.id === fileDepartmentId : true))
                .map((person) => (
                  <option key={person.id} value={person.id}>{person.full_name} · {person.staff_number}</option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Document</span>
            <select value={docType} onChange={(event) => setDocType(event.target.value)} className="form-control">
              {docTypes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">File</span>
            <input type="file" className="form-control" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
          </label>
          <div className="md:col-span-3">
            <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">Store on personnel file</button>
          </div>
        </form>
      )}
    </div>
  );
}

function ApplicationsPanel({
  applications,
  staff,
  canReview,
  onSaved,
  onError
}: {
  applications: any[];
  staff: StaffRow[];
  canReview: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = applications.find((item) => item.id === selectedId) ?? null;
  const selectedMatches = selected
    ? staff.filter((person) => matchesIdentity(person, selected) && person.id !== selected.staff_id && person.id !== selected.staff?.id)
    : [];

  function closePopup() {
    setSelectedId("");
    setNote("");
  }

  async function decide(decision: "approve" | "reject" | "under_review") {
    if (!selected) return;
    setBusy(true);
    onError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/apply/review", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: selected.id,
          decision,
          reviewNote: note || null
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Review failed");
      closePopup();
      if (decision === "approve") {
        await onSaved(payload.message || `${selected.full_name} approved.`);
      } else if (decision === "reject") {
        await onSaved(`${selected.full_name} rejected.`);
      } else {
        await onSaved(`${selected.full_name} marked under review.`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-3xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Placement</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Staff ID</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => {
                  setSelectedId(item.id);
                  setNote("");
                }}
              >
                <td className="px-4 py-3 font-medium text-slate-950">{item.reference_code}</td>
                <td className="px-4 py-3">{item.full_name}</td>
                <td className="px-4 py-3">{departmentLabel(item.departments)}</td>
                <td className="px-4 py-3">{titleCase(item.proposed_ims_role)}</td>
                <td className="px-4 py-3">{titleCase(item.status)}</td>
                <td className="px-4 py-3">{item.staff?.staff_number ?? "—"}</td>
              </tr>
            ))}
            {!applications.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No applications yet. Share https://ims.tanjuriel.com/apply with staff.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 px-3 py-3 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          onClick={closePopup}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-application-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">Staff application</p>
                <h3 id="staff-application-title" className="mt-1 truncate text-lg font-semibold tracking-tight text-slate-950">
                  {selected.full_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selected.reference_code} · {titleCase(selected.status)}
                  {selected.staff?.staff_number ? ` · ${selected.staff.staff_number}` : ""}
                </p>
              </div>
              <button type="button" onClick={closePopup} className="secondary-button shrink-0 px-3 py-2 text-xs sm:text-sm">
                Close
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div className="space-y-3 text-sm text-slate-700">
                  <p>
                    {selected.preferred_name ? `Preferred: ${selected.preferred_name} · ` : ""}
                    {selected.sex} · DOB {selected.date_of_birth} · {selected.nationality}
                  </p>
                  <p>
                    {selected.phone} · {selected.personal_email}
                    {selected.work_email ? ` · ${selected.work_email}` : ""}
                  </p>
                  <p>{selected.home_address}</p>
                  <p>
                    Next of kin: {selected.next_of_kin_name} ({selected.next_of_kin_phone})
                  </p>
                  <p>
                    {titleCase(selected.staff_type)} · {titleCase(selected.employment_type)} · {titleCase(selected.employment_status)} · joined{" "}
                    {selected.start_date}
                  </p>
                  <p>
                    {departmentLabel(selected.departments)}
                  </p>
                  <p>
                    {selected.job_title} · IMS role {titleCase(selected.proposed_ims_role)}
                    {selected.reports_to_name ? ` · reports to ${selected.reports_to_name}` : ""}
                    {selected.work_location ? ` · ${selected.work_location}` : ""}
                  </p>
                  <p>
                    ID type: {titleCase(selected.government_id_type)}
                    {selected.government_id_number ? ` · ${selected.government_id_number}` : ""}
                    {selected.nin ? ` · NIN ${selected.nin}` : ""}
                    {selected.bvn ? ` · BVN ${selected.bvn}` : ""}
                  </p>
                  {selectedMatches.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
                      This government-issued ID is already on{" "}
                      {selectedMatches
                        .map((person) => `${person.full_name}${person.staff_number ? ` (${person.staff_number})` : ""}`)
                        .join(", ")}
                      .
                    </div>
                  )}
                  {(selected.bank_name || selected.bank_account) && (
                    <p>Bank: {[selected.bank_name, selected.bank_account].filter(Boolean).join(" · ")}</p>
                  )}
                  <p>
                    Biometric: {titleCase(selected.biometric_method)} · ready {selected.biometric_ready ? "Yes" : "No"}
                    {selected.biometric_note ? ` · ${selected.biometric_note}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    {selected.photograph_url && (
                      <a href={selected.photograph_url} target="_blank" rel="noreferrer" className="secondary-button">
                        Photo
                      </a>
                    )}
                    {selected.id_document_url && (
                      <a href={selected.id_document_url} target="_blank" rel="noreferrer" className="secondary-button">
                        ID document
                      </a>
                    )}
                    {selected.cv_url && (
                      <a href={selected.cv_url} target="_blank" rel="noreferrer" className="secondary-button">
                        CV
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {canReview && !["approved", "rejected"].includes(selected.status) ? (
                    <>
                      <label className="block">
                        <span className="field-label">Review note</span>
                        <textarea value={note} onChange={(event) => setNote(event.target.value)} className="form-control min-h-24" />
                      </label>
                      <div className="flex flex-col gap-2">
                        <button type="button" disabled={busy} className="primary-button disabled:opacity-60" onClick={() => decide("approve")}>
                          Approve & issue Staff ID
                        </button>
                        <button type="button" disabled={busy} className="secondary-button disabled:opacity-60" onClick={() => decide("under_review")}>
                          Mark under review
                        </button>
                        <button type="button" disabled={busy} className="secondary-button disabled:opacity-60" onClick={() => decide("reject")}>
                          Reject
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {selected.status === "approved"
                        ? `Approved. Staff ID ${selected.staff?.staff_number ?? "issued"}.`
                        : selected.status === "rejected"
                          ? `Rejected${selected.review_note ? `: ${selected.review_note}` : "."}`
                          : "You can view this application. Only HR or Director of Administration can decide."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ScopedStaffSelect({
  staff,
  departments,
  name
}: {
  staff: StaffRow[];
  departments: DepartmentRow[];
  name: string;
}) {
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const grouped = groupBySubsidiary(departments).length > 0;
  const people = grouped ? staff.filter((person) => person.departments?.id === departmentId) : staff;

  return (
    <>
      <SubsidiaryDepartmentFields
        departments={departments}
        subsidiaryId={subsidiaryId}
        departmentId={departmentId}
        onSubsidiaryId={setSubsidiaryId}
        onDepartmentId={setDepartmentId}
      />
      <Select
        key={departmentId || "none"}
        label="Staff member"
        name={name}
        required
        options={people.map((person) => [person.id, `${person.full_name} · ${person.staff_number}`])}
      />
    </>
  );
}

function LettersPanel({
  staff,
  departments,
  letters,
  canWrite,
  onSaved,
  onError
}: {
  staff: StaffRow[];
  departments: DepartmentRow[];
  letters: any[];
  canWrite: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError("");
    const form = new FormData(event.currentTarget);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/letters", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: form.get("staffId"), letterType: form.get("letterType") })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to issue the letter");
      event.currentTarget.reset();
      await onSaved(`Letter issued as ${payload.letter.reference_number}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to issue the letter");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">Letter numbers are separate from staff numbers, in the form TAN/LET/ICT/2026/001, and they stay tied to the staff record. Human Resources can correct a reference, and the previous number is kept.</p>
      {canWrite && (
        <form onSubmit={issue} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <ScopedStaffSelect staff={staff} departments={departments} name="staffId" />
          <Select label="Letter" name="letterType" required options={letterTypes.map((item) => [item, titleCase(item)])} />
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">Issue reference</button>
          </div>
        </form>
      )}
      <div className="space-y-3">
        {letters.map((letter) => (
          <article key={letter.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-950">{letter.reference_number}</p>
            <p className="mt-1 text-sm text-slate-600">
              {titleCase(letter.letter_type)} · {letter.staff?.full_name} · {letter.staff?.staff_number}
            </p>
          </article>
        ))}
        {!letters.length && <p className="text-sm text-slate-500">No letters issued yet.</p>}
      </div>
    </div>
  );
}

function LeavePanel({
  staff,
  departments,
  requests,
  role,
  canWrite,
  canApprove,
  onSaved,
  onError
}: {
  staff: StaffRow[];
  departments: DepartmentRow[];
  requests: any[];
  role: string;
  canWrite: boolean;
  canApprove: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const leaveWindow = leaveDateWindow(leaveType, startDate);

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onError("");
    const form = new FormData(event.currentTarget);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/leave", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to submit leave");
      event.currentTarget.reset();
      setLeaveType("");
      setStartDate("");
      setEndDate("");
      await onSaved("Leave request sent to the Executive Director.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to submit leave");
    } finally {
      setBusy(false);
    }
  }

  async function decide(requestId: string, decision: "approve" | "refuse") {
    onError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/leave", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to update leave");
      await onSaved(
        decision === "approve"
          ? role === "executive-director"
            ? "Leave sent to the Director of Administration."
            : "Leave approved."
          : "Leave refused."
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update leave");
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-slate-600">
        {role === "executive-director"
          ? "You are the first decision on leave in this subsidiary. Approve it and it goes to the Director of Administration. Refuse it and it stops here."
          : "Annual leave is unpaid and is 10 to 20 working days by the person’s level. Sick leave is unpaid and is 2 to 5 working days. Unused annual leave expires at the end of the year. If no days remain, the request is refused. NYSC members and interns have no leave allowance except emergency leave or unpaid leave on request. Maternity, paternity, and compassionate leave are included, and whether they are paid is still to be confirmed."}
      </p>
      {canWrite && (
        <form onSubmit={submitLeave} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <ScopedStaffSelect staff={staff.filter((person) => !["resigned", "retired", "dismissed"].includes(person.status))} departments={departments} name="staffId" />
          <label className="block">
            <span className="field-label">Leave type</span>
            <select
              name="leaveType"
              required
              className="form-control"
              value={leaveType}
              onChange={(event) => {
                const nextType = event.target.value;
                setLeaveType(nextType);
                setEndDate(clampLeaveEndDate(nextType, startDate, endDate));
              }}
            >
              <option value="" disabled>
                Select
              </option>
              {(Object.keys(leaveRules) as LeaveCode[]).map((key) => (
                <option key={key} value={key}>
                  {leaveRules[key].label}
                </option>
              ))}
            </select>
            {leaveWindow.hint ? <p className="mt-1 text-xs text-slate-500">{leaveWindow.hint}</p> : null}
          </label>
          <label className="block">
            <span className="field-label">Start date</span>
            <input
              name="startDate"
              type="date"
              required
              className="form-control"
              value={startDate}
              onChange={(event) => {
                const nextStart = event.target.value;
                setStartDate(nextStart);
                setEndDate(clampLeaveEndDate(leaveType, nextStart, endDate));
              }}
            />
          </label>
          <label className="block">
            <span className="field-label">End date</span>
            <input
              name="endDate"
              type="date"
              required
              className="form-control"
              min={leaveWindow.min}
              max={leaveWindow.max}
              value={endDate}
              onChange={(event) => setEndDate(clampLeaveEndDate(leaveType, startDate, event.target.value))}
            />
            {leaveWindow.min || leaveWindow.max ? (
              <p className="mt-1 text-xs text-slate-500">
                {[leaveWindow.min ? `From ${leaveWindow.min}` : "", leaveWindow.max ? `to ${leaveWindow.max}` : ""]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            ) : null}
          </label>
          <Field label="Supporting document note" name="documentNote" className="md:col-span-2" />
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">Submit leave request</button>
          </div>
        </form>
      )}
      <div className="space-y-3">
        {requests.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.staff?.full_name} · {leaveRules[item.leave_type as LeaveCode]?.label ?? item.leave_type}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {item.start_date} to {item.end_date} · {item.working_days} working days · {titleCase(item.pay_status)} · {titleCase(item.status)}
                </p>
              </div>
              {canApprove &&
                ((role === "executive-director" && item.status === "pending_executive_director") ||
                  (role === "director-of-administration" && item.status === "pending_director_of_administration")) && (
                <span className="flex gap-2">
                  <button type="button" className="table-button" onClick={() => decide(item.id, "approve")}>Approve</button>
                  <button type="button" className="table-button text-red-700" onClick={() => decide(item.id, "refuse")}>Refuse</button>
                </span>
              )}
            </div>
          </article>
        ))}
        {!requests.length && <p className="text-sm text-slate-500">No leave requests yet.</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  className
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="field-label">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className="form-control" />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  required
}: {
  label: string;
  name: string;
  options: Array<[string, string]>;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select name={name} required={required} className="form-control" defaultValue="">
        <option value="" disabled>Select</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
    </label>
  );
}
