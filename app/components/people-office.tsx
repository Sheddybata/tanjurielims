"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { fetchDepartments, type DepartmentRow } from "@/lib/ims/data";
import { leaveRules, type LeaveCode } from "@/lib/ims/leave-rules";
import { groupBySubsidiary, SubsidiaryDepartmentFields } from "@/app/components/org-select";

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
  job_title: string;
  phone: string;
  personal_email: string;
  start_date: string;
  status: string;
  date_of_birth: string;
  sex: string;
  home_address: string;
  next_of_kin_name: string;
  next_of_kin_phone: string;
  government_id_number: string;
  bank_account: string;
  annual_leave_days: number;
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
  canApproveLeave
}: {
  page: PeoplePage;
  role: string;
  canWritePeople: boolean;
  canApproveLeave: boolean;
}) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [canReviewApplications, setCanReviewApplications] = useState(false);

  async function load() {
    const headers = await authHeaders();
    const [staffResponse, departmentRows] = await Promise.all([
      fetch("/api/staff", { headers }),
      fetchDepartments()
    ]);
    const staffPayload = await staffResponse.json();
    if (!staffResponse.ok) throw new Error(staffPayload.error || "Failed to load staff");
    setStaff(staffPayload.staff ?? []);
    setDepartments(departmentRows);

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
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [page]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">People</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{page}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {page === "Staff Applications"
            ? "Public submissions from /apply. HR and Director of Administration verify records. Staff ID is issued only on approval."
            : "Staff numbers use the department and the year, for example TAN/EMP/ICT/2026/001. A number can be given to a new employee after the previous holder is marked resigned, retired, or dismissed."}
        </p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
      {page === "Staff Register" && (
        <StaffRegister
          staff={staff}
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
      {page === "Staff Applications" && (
        <ApplicationsPanel
          applications={applications}
          canReview={canReviewApplications}
          onSaved={async (message) => {
            setNotice(message);
            setError("");
            await load();
          }}
          onError={setError}
        />
      )}
      {page === "Letters" && (
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
      {page === "Leave" && (
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
  departments,
  canWrite,
  onSaved,
  onError
}: {
  staff: StaffRow[];
  departments: DepartmentRow[];
  canWrite: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [docType, setDocType] = useState("cv");
  const [file, setFile] = useState<File | null>(null);
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [fileSubsidiaryId, setFileSubsidiaryId] = useState("");
  const [fileDepartmentId, setFileDepartmentId] = useState("");

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
      await onSaved(`${payload.staff.full_name} is registered as ${payload.staff.staff_number}.`);
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
      {canWrite && (
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
          <Field label="Government identity number" name="governmentIdNumber" required />
          <Field label="Bank account" name="bankAccount" required />
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
            {staff.map((person) => (
              <tr key={person.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-950">{person.staff_number}</td>
                <td className="px-4 py-3">{person.full_name}</td>
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
                          <button key={status} type="button" className="table-button" onClick={() => markLeft(person, status)}>
                            {titleCase(status)}
                          </button>
                        ))}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!staff.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-slate-500">No staff records yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
  canReview,
  onSaved,
  onError
}: {
  applications: any[];
  canReview: boolean;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = applications.find((item) => item.id === selectedId) ?? null;

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
      setNote("");
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
                className={`cursor-pointer border-t border-slate-100 ${selectedId === item.id ? "bg-blue-50" : "hover:bg-slate-50"}`}
                onClick={() => setSelectedId(item.id)}
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
        <div className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3 text-sm text-slate-700">
            <h3 className="text-lg font-semibold text-slate-950">{selected.full_name}</h3>
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
            {(selected.bank_name || selected.bank_account) && (
              <p>Bank: {[selected.bank_name, selected.bank_account].filter(Boolean).join(" · ")}</p>
            )}
            <p>
              Biometric: {titleCase(selected.biometric_method)} · ready {selected.biometric_ready ? "Yes" : "No"}
              {selected.biometric_note ? ` · ${selected.biometric_note}` : ""}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
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
                <div className="flex flex-wrap gap-2">
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
      await onSaved(decision === "approve" ? "Leave moved forward." : "Leave refused.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update leave");
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-slate-600">
        Annual leave is unpaid and is 10 to 20 working days by the person’s level. Sick leave is unpaid and is 2 to 5 working days. Unused annual leave expires at the end of the year. If no days remain, the request is refused. NYSC members and interns have no leave allowance except emergency leave or unpaid leave on request. Maternity, paternity, and compassionate leave are included, and whether they are paid is still to be confirmed.
      </p>
      {canWrite && (
        <form onSubmit={submitLeave} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <ScopedStaffSelect staff={staff.filter((person) => !["resigned", "retired", "dismissed"].includes(person.status))} departments={departments} name="staffId" />
          <Select label="Leave type" name="leaveType" required options={(Object.keys(leaveRules) as LeaveCode[]).map((key) => [key, leaveRules[key].label])} />
          <Field label="Start date" name="startDate" type="date" required />
          <Field label="End date" name="endDate" type="date" required />
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
