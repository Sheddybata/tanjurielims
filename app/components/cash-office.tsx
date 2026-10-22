"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { DepartmentRow } from "@/lib/ims/data";
import { isBankingFinance } from "@/lib/ims/service";
import { ListLoader } from "@/app/components/list-loader";

async function authHeaders() {
  const { data } = await getSupabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  return { Authorization: `Bearer ${token}` };
}

function naira(value: number) {
  return `₦${Number(value ?? 0).toLocaleString("en-NG")}`;
}

export function CashOffice({
  departments,
  departmentId
}: {
  departments: DepartmentRow[];
  departmentId?: string;
}) {
  const moneyDepartments = departments.filter((item) => isBankingFinance(item));
  const [chosen, setChosen] = useState(departmentId && moneyDepartments.some((item) => item.id === departmentId) ? departmentId : moneyDepartments[0]?.id ?? "");

  useEffect(() => {
    if (!chosen && moneyDepartments[0]?.id) setChosen(moneyDepartments[0].id);
  }, [chosen, moneyDepartments]);
  const [entries, setEntries] = useState<any[]>([]);
  const [money, setMoney] = useState(moneyDepartments.length > 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ entryDate: new Date().toISOString().slice(0, 10), openingBalance: "0", cashIn: "", cashOut: "", source: "", purpose: "" });
  const [loading, setLoading] = useState(true);

  async function load(id: string) {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers = await authHeaders();
    const response = await fetch(`/api/cash?departmentId=${id}`, { headers });
    const payload = await response.json();
    if (!response.ok && payload.error && payload.money === false) {
      setMoney(false);
      setEntries([]);
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Failed to load cash book");
    setMoney(Boolean(payload.money));
    setEntries(payload.entries ?? []);
  }

  useEffect(() => {
    load(chosen)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [chosen]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/cash", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: chosen,
          entryDate: form.entryDate,
          openingBalance: Number(form.openingBalance || 0),
          cashIn: Number(form.cashIn || 0),
          cashOut: Number(form.cashOut || 0),
          source: form.source,
          purpose: form.purpose
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setForm({ ...form, cashIn: "", cashOut: "", source: "", purpose: "" });
      await load(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Stewardship</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Cash book</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Banking and Finance cash trail for this login. Not a full ledger. Other departments bank with their own Executive Director. Daily reports still carry the pulse figures.
        </p>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {moneyDepartments.length > 1 && (
        <select className="form-control w-full sm:max-w-md" value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {moneyDepartments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.subsidiaryName ? `${item.subsidiaryName} · ` : ""}
              {item.name}
            </option>
          ))}
        </select>
      )}
      {!money && <p className="text-sm text-slate-600">Cash book is only for Banking and Finance logins.</p>}
      {money && (
        <>
          <form onSubmit={save} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 md:grid-cols-3">
            <label className="block">
              <span className="field-label">Date</span>
              <input type="date" className="form-control" required value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Opening</span>
              <input className="form-control" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Cash in</span>
              <input className="form-control" value={form.cashIn} onChange={(event) => setForm({ ...form, cashIn: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Cash out</span>
              <input className="form-control" value={form.cashOut} onChange={(event) => setForm({ ...form, cashOut: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Source</span>
              <input className="form-control" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
            </label>
            <label className="block md:col-span-3">
              <span className="field-label">Purpose</span>
              <input className="form-control" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
            </label>
            <div className="md:col-span-3">
              <button type="submit" disabled={busy} className="primary-button w-full sm:w-auto disabled:opacity-60">
                {busy ? "Saving..." : "Record movement"}
              </button>
            </div>
          </form>
          {loading ? (
            <ListLoader label="Loading cash book…" variant="table" />
          ) : (
          <>
          <div className="space-y-3 md:hidden">
            {entries.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <p className="font-semibold text-slate-950">{item.entry_date}</p>
                <p className="mt-1 text-slate-600">In {naira(item.cash_in)} · Out {naira(item.cash_out)}</p>
                <p className="mt-1 font-medium text-slate-900">Closing {naira(item.closing_balance)}</p>
                {(item.source || item.purpose) && (
                  <p className="mt-2 text-slate-600">{[item.source, item.purpose].filter(Boolean).join(" · ")}</p>
                )}
              </article>
            ))}
            {!entries.length && <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No cash movements yet.</p>}
          </div>
          <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">In</th>
                  <th className="px-4 py-3">Out</th>
                  <th className="px-4 py-3">Closing</th>
                  <th className="px-4 py-3">Source / purpose</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{item.entry_date}</td>
                    <td className="px-4 py-3">{naira(item.cash_in)}</td>
                    <td className="px-4 py-3">{naira(item.cash_out)}</td>
                    <td className="px-4 py-3">{naira(item.closing_balance)}</td>
                    <td className="px-4 py-3">{[item.source, item.purpose].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
                {!entries.length && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No cash movements yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
          )}
        </>
      )}
    </div>
  );
}
