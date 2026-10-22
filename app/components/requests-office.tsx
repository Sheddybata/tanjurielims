"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { clampLeaveEndDate, leaveDateWindow, leaveRules, type LeaveCode } from "@/lib/ims/leave-rules";
import {
  questionsForCategory,
  requestStatusLabel,
  type RequestQuestion,
  type RequestStatus
} from "@/lib/ims/service";
import { ListLoader } from "@/app/components/list-loader";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

type TeamMember = {
  id: string;
  fullName: string;
  jobTitle?: string;
  staffNumber?: string;
  profileId?: string | null;
};

const ANSWER_LABELS: Record<string, string> = {
  forWhom: "For",
  staffId: "Staff",
  staffName: "Staff",
  leaveType: "Leave type",
  startDate: "Start date",
  endDate: "End date",
  documentNote: "Supporting note",
  fromDate: "From",
  toDate: "To",
  reason: "Reason",
  item: "Item",
  urgency: "Urgency",
  assetCode: "Asset ID",
  fault: "Fault",
  location: "Location",
  system: "System",
  issue: "Issue",
  what: "What is needed",
  details: "Details"
};

export function RequestsOffice({
  startNew,
  canRequestForTeam
}: {
  startNew?: boolean;
  canRequestForTeam?: boolean;
}) {
  const [tab, setTab] = useState<"waiting" | "mine">("waiting");
  const [composing, setComposing] = useState(Boolean(startNew));
  const [categories, setCategories] = useState<any[]>([]);
  const [waiting, setWaiting] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({ forWhom: "self" });
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loading, setLoading] = useState(true);

  const chosen = categories.find((item) => item.id === categoryId);
  const questions = useMemo(() => questionsForCategory(chosen), [chosen]);
  const leaveType = answers.leaveType as LeaveCode;
  const leaveNeedsNote = Boolean(chosen?.slug === "leave" && leaveType && leaveRules[leaveType]?.document);
  const leaveWindow = leaveDateWindow(leaveType, answers.startDate);

  async function load() {
    const headers = await authHeaders();
    const [catRes, waitRes, mineRes, teamRes] = await Promise.all([
      fetch("/api/service/categories", { headers }),
      fetch("/api/service/requests?scope=waiting", { headers }),
      fetch("/api/service/requests?scope=mine", { headers }),
      canRequestForTeam ? fetch("/api/directory", { headers }) : Promise.resolve(null)
    ]);
    const cats = await catRes.json();
    const waits = await waitRes.json();
    const mines = await mineRes.json();
    if (!catRes.ok) throw new Error(cats.error || "Failed to load request types");
    setCategories(cats.categories ?? []);
    setWaiting(waits.requests ?? []);
    setMine(mines.requests ?? []);
    setNeedsMigration(Boolean(cats.needsMigration || waits.needsMigration || mines.needsMigration));
    if (teamRes) {
      const payload = await teamRes.json();
      if (teamRes.ok) setTeam(payload.people ?? []);
    }
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [canRequestForTeam]);

  useEffect(() => {
    if (startNew) setComposing(true);
  }, [startNew]);

  function closeComposer() {
    setComposing(false);
    setCategoryId("");
    setAnswers({ forWhom: "self" });
  }

  async function openRequest(id: string) {
    setError("");
    const headers = await authHeaders();
    const response = await fetch(`/api/service/requests/${id}`, { headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to open request");
    setSelected(payload.request);
    setEvents(payload.events ?? []);
    setNote("");
  }

  async function submitNew(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (canRequestForTeam && answers.forWhom === "staff" && !answers.staffId) {
        throw new Error("Choose the staff member this request is for");
      }
      const headers = await authHeaders();
      const chosenStaff = team.find((person) => person.id === answers.staffId);
      const response = await fetch("/api/service/requests", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          answers: {
            ...answers,
            staffName: answers.forWhom === "staff" ? chosenStaff?.fullName ?? answers.staffName : answers.staffName
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Submit failed");
      setNotice(`Submitted ${payload.request.reference_code}.`);
      closeComposer();
      setTab("mine");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: string, extra?: Record<string, unknown>) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/service/requests/${selected.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note, ...extra })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Update failed");
      setNotice(`${payload.request.reference_code} is now ${requestStatusLabel[payload.request.status as RequestStatus]}.`);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function setAnswer(key: string, value: string) {
    setAnswers((current) => {
      const next = { ...current, [key]: value };
      if (key === "leaveType" || key === "startDate") {
        next.endDate = clampLeaveEndDate(key === "leaveType" ? value : next.leaveType, key === "startDate" ? value : next.startDate, next.endDate);
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Service</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Requests</h2>
        <p className="mt-2 text-sm text-slate-600">
          {canRequestForTeam
            ? "Raise leave, permission, equipment, maintenance, or IT for yourself or for staff in your department."
            : "Raise leave, permission, equipment, maintenance, or IT."}
        </p>
      </div>
      {needsMigration && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You can fill the form below. To save live requests, run <span className="font-semibold">supabase/migrations/202610210001_service_lane.sql</span> in the Supabase SQL editor, then refresh.
        </div>
      )}
      {error && !composing && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["waiting", `Waiting (${waiting.length})`],
              ["mine", "Mine"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? "primary-button" : "secondary-button"}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary-button w-full sm:w-auto"
          onClick={() => {
            setError("");
            setComposing(true);
          }}
        >
          + New
        </button>
      </div>

      {loading ? (
        <ListLoader label="Loading requests…" />
      ) : (
        <RequestList
          rows={tab === "waiting" ? waiting : mine}
          onOpen={(id) => openRequest(id).catch((err) => setError(err instanceof Error ? err.message : "Failed"))}
        />
      )}

      {composing && (
        <div
          className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6"
          onClick={() => {
            if (!busy) closeComposer();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-request-title"
            className="flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:border sm:border-slate-200"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">New request</p>
                <h3 id="new-request-title" className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
                  {chosen ? chosen.name : "What do you need?"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {chosen ? "Fill the details, then submit." : "Leave, permission, equipment, maintenance, or IT."}
                </p>
              </div>
              <button type="button" className="secondary-button shrink-0" onClick={closeComposer} disabled={busy}>
                Close
              </button>
            </div>

            <form onSubmit={submitNew} className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
                {!chosen ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {categories.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(item.id);
                          setAnswers({ forWhom: answers.forWhom || "self", staffId: answers.staffId || "" });
                        }}
                        className="min-h-[4.5rem] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-700 hover:bg-blue-50"
                      >
                        <p className="font-semibold text-slate-950">{item.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                      </button>
                    ))}
                    {!categories.length && (
                      <p className="sm:col-span-2 text-sm text-slate-500">Request types have not loaded yet. Run the service-lane SQL if this stays empty.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <button
                      type="button"
                      className="text-sm font-semibold text-blue-800"
                      onClick={() => {
                        setCategoryId("");
                        setAnswers({ forWhom: "self" });
                      }}
                    >
                      ← Change type
                    </button>

                    {canRequestForTeam && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="field-label">Who is this for?</span>
                          <select
                            className="form-control"
                            required
                            value={answers.forWhom ?? "self"}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                forWhom: event.target.value,
                                staffId: event.target.value === "self" ? "" : current.staffId
                              }))
                            }
                          >
                            <option value="self">Myself</option>
                            <option value="staff">A staff member in my department</option>
                          </select>
                        </label>
                        {answers.forWhom === "staff" && (
                          <label className="block">
                            <span className="field-label">Staff member</span>
                            <select
                              className="form-control"
                              required
                              value={answers.staffId ?? ""}
                              onChange={(event) => setAnswer("staffId", event.target.value)}
                            >
                              <option value="">Select staff</option>
                              {team.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.fullName}
                                  {person.jobTitle ? ` · ${person.jobTitle}` : ""}
                                  {person.staffNumber ? ` · ${person.staffNumber}` : ""}
                                </option>
                              ))}
                            </select>
                            {!team.length && (
                              <p className="mt-1 text-xs text-slate-500">No verified staff in your department yet.</p>
                            )}
                          </label>
                        )}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      {questions.map((question) => (
                        <QuestionField
                          key={question.key}
                          question={question}
                          value={answers[question.key] ?? ""}
                          required={question.key === "documentNote" ? leaveNeedsNote : Boolean(question.required)}
                          min={question.key === "endDate" ? leaveWindow.min : undefined}
                          max={question.key === "endDate" ? leaveWindow.max : undefined}
                          hint={
                            question.key === "leaveType"
                              ? leaveWindow.hint
                              : question.key === "endDate" && (leaveWindow.min || leaveWindow.max)
                                ? [leaveWindow.min ? `From ${leaveWindow.min}` : "", leaveWindow.max ? `to ${leaveWindow.max}` : ""]
                                    .filter(Boolean)
                                    .join(" ")
                                : undefined
                          }
                          onChange={(value) => setAnswer(question.key, value)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {chosen && (
                <div
                  className="border-t border-slate-100 px-4 py-3 sm:px-5 sm:py-4"
                  style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
                >
                  <button type="submit" disabled={busy || !categoryId} className="primary-button w-full disabled:opacity-60">
                    {busy ? "Submitting..." : "Submit request"}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-slate-950/45 sm:items-center sm:px-4 sm:py-6" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            className="flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-3xl sm:border sm:border-slate-200"
            style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-800">{selected.reference_code}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">{selected.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{requestStatusLabel[selected.status as RequestStatus]}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <div
              className="space-y-4 overflow-y-auto px-4 py-4 text-sm text-slate-700 sm:px-5"
              style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
            >
              {Object.entries(selected.answers ?? {})
                .filter(([key]) => key !== "staffId")
                .map(([key, value]) => (
                  <p key={key}>
                    <span className="font-semibold">{ANSWER_LABELS[key] ?? key}: </span>
                    {formatAnswer(key, value)}
                  </p>
                ))}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {events.map((item) => (
                  <p key={item.id} className="text-xs text-slate-500">
                    {requestStatusLabel[item.to_status as RequestStatus] ?? item.to_status}
                    {item.actor?.full_name ? ` · ${item.actor.full_name}` : ""} · {new Date(item.created_at).toLocaleString("en-GB")}
                    {item.note ? ` — ${item.note}` : ""}
                  </p>
                ))}
              </div>
              <label className="block">
                <span className="field-label">Note</span>
                <textarea className="form-control min-h-20" value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {["under_review", "submitted", "needs_information"].includes(selected.status) && (
                  <>
                    <button type="button" disabled={busy} className="primary-button w-full sm:w-auto" onClick={() => decide("approve")}>
                      Approve
                    </button>
                    <button type="button" disabled={busy} className="secondary-button w-full sm:w-auto" onClick={() => decide("needs_information")}>
                      Needs information
                    </button>
                    <button type="button" disabled={busy} className="secondary-button w-full sm:w-auto" onClick={() => decide("reject")}>
                      Reject
                    </button>
                  </>
                )}
                {selected.status === "approved" && (
                  <button type="button" disabled={busy} className="primary-button w-full sm:w-auto" onClick={() => decide("start")}>
                    Start work
                  </button>
                )}
                {selected.status === "in_progress" && (
                  <button type="button" disabled={busy} className="primary-button w-full sm:w-auto" onClick={() => decide("complete")}>
                    Mark completed
                  </button>
                )}
                {selected.status === "needs_information" && (
                  <button type="button" disabled={busy} className="primary-button w-full sm:w-auto" onClick={() => decide("resubmit")}>
                    Resubmit
                  </button>
                )}
                {!["completed", "rejected", "cancelled"].includes(selected.status) && (
                  <button type="button" disabled={busy} className="secondary-button w-full sm:w-auto" onClick={() => decide("cancel")}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function formatAnswer(key: string, value: unknown) {
  if (key === "forWhom") return value === "staff" ? "A staff member in my department" : "Myself";
  if (key === "leaveType") return leaveRules[value as LeaveCode]?.label ?? String(value);
  return String(value ?? "");
}

function QuestionField({
  question,
  value,
  required,
  min,
  max,
  hint,
  onChange
}: {
  question: RequestQuestion;
  value: string;
  required: boolean;
  min?: string;
  max?: string;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const wide = question.type === "textarea";
  return (
    <label className={wide ? "sm:col-span-2 block" : "block"}>
      <span className="field-label">{question.label}</span>
      {question.type === "textarea" ? (
        <textarea className="form-control min-h-24" required={required} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : question.type === "select" || question.type === "leave_type" ? (
        <select className="form-control" required={required} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select</option>
          {(question.type === "leave_type"
            ? (Object.keys(leaveRules) as LeaveCode[]).map((key) => [key, leaveRules[key].label] as const)
            : (question.options ?? []).map((option) => [option, option] as const)
          ).map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={question.type === "date" ? "date" : "text"}
          className="form-control"
          required={required}
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </label>
  );
}

function RequestList({ rows, onOpen }: { rows: any[]; onOpen: (id: string) => void }) {
  if (!rows.length) {
    return <p className="rounded-3xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">No requests here yet.</p>;
  }
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className="flex min-h-[4.25rem] w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left"
          >
            <div className="min-w-0">
              <p className="font-semibold text-slate-950">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{item.reference_code}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
              {requestStatusLabel[item.status as RequestStatus] ?? item.status}
            </span>
          </button>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onOpen(item.id)}>
                <td className="px-4 py-3 font-medium">{item.reference_code}</td>
                <td className="px-4 py-3">{item.title}</td>
                <td className="px-4 py-3">{requestStatusLabel[item.status as RequestStatus] ?? item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
