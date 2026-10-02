"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchDepartments, type DepartmentRow } from "@/lib/ims/data";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SubsidiaryDepartmentFields } from "@/app/components/org-select";

type KpiRow = {
  id: string;
  measure: string;
  target_value: number;
  unit: string;
  period_start: string;
  period_end: string;
  actual_value: number | null;
  actual_note: string | null;
  subsidiary_id: string;
  department_id: string | null;
  subsidiaries?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  departments?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatAmount(value: number | null, unit: string) {
  if (value == null) return "Not entered";
  const amount = Number(value).toLocaleString("en-NG");
  return unit ? `${amount} ${unit}` : amount;
}

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

export function KpiOffice({
  canSetTarget,
  departmentId
}: {
  canSetTarget: boolean;
  departmentId?: string;
}) {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [subsidiaryId, setSubsidiaryId] = useState("");
  const [chosenDepartmentId, setChosenDepartmentId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const headers = await authHeaders();
    const [response, departmentRows] = await Promise.all([fetch("/api/kpis", { headers }), fetchDepartments()]);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load targets");
    setKpis(payload.kpis ?? []);
    setDepartments(departmentRows);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load targets"));
  }, []);

  async function createTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/kpis", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          subsidiaryId,
          departmentId: chosenDepartmentId,
          measure: form.get("measure"),
          targetValue: form.get("targetValue"),
          unit: form.get("unit"),
          periodStart: form.get("periodStart"),
          periodEnd: form.get("periodEnd")
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to set the target");
      event.currentTarget.reset();
      setSubsidiaryId("");
      setChosenDepartmentId("");
      setNotice("Target saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set the target");
    } finally {
      setBusy(false);
    }
  }

  async function saveResult(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/kpis", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          actualValue: form.get("actualValue"),
          actualNote: form.get("actualNote")
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save the result");
      setNotice("Result saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the result");
    }
  }

  function canEnter(kpi: KpiRow) {
    if (canSetTarget) return true;
    if (!departmentId) return true;
    return !kpi.department_id || kpi.department_id === departmentId;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Performance</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Directorate KPIs</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          The Director of Administration sets the target with the director of that subsidiary. The subsidiary director, or the manager who owns the work, enters the result afterwards.
        </p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}

      {canSetTarget && (
        <form onSubmit={createTarget} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-2">
          <SubsidiaryDepartmentFields
            departments={departments}
            subsidiaryId={subsidiaryId}
            departmentId={chosenDepartmentId}
            onSubsidiaryId={setSubsidiaryId}
            onDepartmentId={setChosenDepartmentId}
            departmentOptional
          />
          <label className="block md:col-span-2">
            <span className="field-label">What is measured</span>
            <input name="measure" required className="form-control" placeholder="Monthly revenue" />
          </label>
          <label className="block">
            <span className="field-label">Target</span>
            <input name="targetValue" type="number" step="any" required className="form-control" />
          </label>
          <label className="block">
            <span className="field-label">Unit</span>
            <input name="unit" className="form-control" placeholder="naira, people, percent" />
          </label>
          <label className="block">
            <span className="field-label">Period start</span>
            <input name="periodStart" type="date" required className="form-control" />
          </label>
          <label className="block">
            <span className="field-label">Period end</span>
            <input name="periodEnd" type="date" required className="form-control" />
          </label>
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="primary-button disabled:opacity-60">
              {busy ? "Saving..." : "Set target"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {kpis.map((kpi) => {
          const subsidiary = one(kpi.subsidiaries)?.name ?? "Subsidiary";
          const department = one(kpi.departments)?.name;
          return (
            <article key={kpi.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-950">{kpi.measure}</p>
              <p className="mt-1 text-sm text-slate-600">
                {subsidiary}
                {department ? ` · ${department}` : ""} · {kpi.period_start} to {kpi.period_end}
              </p>
              <p className="mt-2 text-sm text-slate-800">
                Target {formatAmount(Number(kpi.target_value), kpi.unit)} · Result {formatAmount(kpi.actual_value == null ? null : Number(kpi.actual_value), kpi.unit)}
              </p>
              {kpi.actual_note && <p className="mt-1 text-sm text-slate-500">{kpi.actual_note}</p>}
              {canEnter(kpi) && (
                <form onSubmit={(event) => saveResult(event, kpi.id)} className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
                  <input
                    name="actualValue"
                    type="number"
                    step="any"
                    required
                    defaultValue={kpi.actual_value ?? ""}
                    placeholder="Result"
                    className="form-control"
                  />
                  <input name="actualNote" defaultValue={kpi.actual_note ?? ""} placeholder="Short note" className="form-control" />
                  <button type="submit" className="primary-button">Save result</button>
                </form>
              )}
            </article>
          );
        })}
        {!kpis.length && <p className="text-sm text-slate-500">No targets yet.</p>}
      </div>
    </div>
  );
}
