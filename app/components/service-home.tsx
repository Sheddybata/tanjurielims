"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { requestStatusLabel, type RequestStatus } from "@/lib/ims/service";
import { ListLoader } from "@/app/components/list-loader";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

type HomePage =
  | "Requests"
  | "Daily Submission"
  | "Directory"
  | "Announcements"
  | "Cash Book"
  | "Check-ins"
  | "Department Reports"
  | "Leave"
  | "Staff Register"
  | "Operations Overview";

type DeskItem = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  page: HomePage;
};

export function ServiceHome({
  name,
  roleLabel,
  canSubmitReports,
  showCash,
  showCheckins,
  directoryScope = "department",
  showDepartmentAccounts,
  onOpen,
  onNewRequest
}: {
  name: string;
  roleLabel: string;
  canSubmitReports: boolean;
  showCash?: boolean;
  showCheckins?: boolean;
  directoryScope?: "department" | "subsidiary";
  showDepartmentAccounts?: boolean;
  onOpen: (page: HomePage) => void;
  onNewRequest: () => void;
}) {
  const [waiting, setWaiting] = useState<DeskItem[]>([]);
  const [openMine, setOpenMine] = useState(0);
  const [notices, setNotices] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const headers = await authHeaders();
        const response = await fetch("/api/service/inbox", { headers });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load home");
        const desk = Array.isArray(payload.desk) && payload.desk.length
          ? payload.desk
          : (payload.waiting ?? []).map((item: any) => {
              const category = Array.isArray(item.request_categories) ? item.request_categories[0] : item.request_categories;
              return {
                id: item.id,
                title: item.title,
                subtitle: `${item.reference_code} · ${category?.name ?? "Request"}`,
                status: item.status,
                page: "Requests" as const
              };
            });
        setWaiting(desk);
        setOpenMine(payload.openMine ?? 0);
        setNotices(payload.announcements ?? []);
        setNeedsMigration(Boolean(payload.needsMigration));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load home");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">{roleLabel}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:mt-2 sm:text-2xl">Hello, {name.split(" ")[0]}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {loading
              ? "Loading your desk…"
              : `${waiting.length ? `${waiting.length} waiting on you.` : "Nothing is waiting on you."} ${
                  openMine ? `${openMine} of your requests still open.` : ""
                }`}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button type="button" className="primary-button w-full sm:w-auto" onClick={onNewRequest}>
            + New request
          </button>
          {canSubmitReports && (
            <button type="button" className="secondary-button w-full sm:w-auto" onClick={() => onOpen("Daily Submission")}>
              Submit today’s report
            </button>
          )}
        </div>
      </div>

      {needsMigration && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Requests will save after the service-lane SQL is run in Supabase.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Waiting on you</h3>
            <p className="hidden text-sm text-slate-500 sm:block">Reports, leave, and requests that need your decision sit here first.</p>
          </div>
          <button type="button" className="shrink-0 text-sm font-semibold text-blue-800" onClick={() => onOpen("Requests")}>
            View all
          </button>
        </div>
        {loading ? (
          <ListLoader label="Loading requests…" />
        ) : waiting.length ? (
          <div className="space-y-3">
            {waiting.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.page)}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-blue-200"
                >
                  <div>
                    <p className="font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.subtitle}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                    {requestStatusLabel[item.status as RequestStatus] ?? item.status}
                  </span>
                </button>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            When someone who reports to you raises a request, it turns up here.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">Announcements</h3>
          <button type="button" className="text-sm font-semibold text-blue-800" onClick={() => onOpen("Announcements")}>
            All
          </button>
        </div>
        {loading ? (
          <ListLoader label="Loading notices…" />
        ) : notices.length ? (
          <div className="space-y-3">
            {notices.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No notices yet.</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <button type="button" className="rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200" onClick={() => onOpen("Directory")}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">People</p>
          <p className="mt-2 font-semibold text-slate-950">Directory</p>
          <p className="mt-1 text-sm text-slate-600">
            {directoryScope === "subsidiary" ? "Find staff in your subsidiary." : "Find staff in your department."}
          </p>
        </button>
        <button type="button" className="rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200" onClick={() => onOpen("Announcements")}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">People</p>
          <p className="mt-2 font-semibold text-slate-950">Announcements</p>
          <p className="mt-1 text-sm text-slate-600">Corporation and department notices.</p>
        </button>
        <button type="button" className="rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200" onClick={() => onOpen("Requests")}>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Service</p>
          <p className="mt-2 font-semibold text-slate-950">My requests</p>
          <p className="mt-1 text-sm text-slate-600">Leave, permission, equipment, IT, and maintenance.</p>
        </button>
        {showCash && (
          <button type="button" className="rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200" onClick={() => onOpen("Cash Book")}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Stewardship</p>
            <p className="mt-2 font-semibold text-slate-950">Cash book</p>
            <p className="mt-1 text-sm text-slate-600">Banking and Finance cash trail for this login.</p>
          </button>
        )}
        {showCheckins && (
          <button type="button" className="rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200" onClick={() => onOpen("Check-ins")}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Stewardship</p>
            <p className="mt-2 font-semibold text-slate-950">Check-ins</p>
            <p className="mt-1 text-sm text-slate-600">Guest suite, date, and amount paid.</p>
          </button>
        )}
        {showDepartmentAccounts && (
          <button type="button" className="rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-blue-200" onClick={() => onOpen("Operations Overview")}>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Accounts</p>
            <p className="mt-2 font-semibold text-slate-950">Department accounts</p>
            <p className="mt-1 text-sm text-slate-600">Billed, collected, and spent across desks that bank with you.</p>
          </button>
        )}
      </section>
    </div>
  );
}
