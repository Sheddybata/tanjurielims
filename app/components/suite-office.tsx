"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { DepartmentRow } from "@/lib/ims/data";
import { isSuiteDepartment } from "@/lib/ims/service";
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

export function SuiteOffice({
  departments,
  departmentId
}: {
  departments: DepartmentRow[];
  departmentId?: string;
}) {
  const suiteDepartments = departments.filter((item) => isSuiteDepartment(item));
  const [chosen, setChosen] = useState(
    departmentId && suiteDepartments.some((item) => item.id === departmentId)
      ? departmentId
      : suiteDepartments[0]?.id ?? departmentId ?? ""
  );
  const [entries, setEntries] = useState<any[]>([]);
  const [suite, setSuite] = useState(suiteDepartments.length > 0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [form, setForm] = useState({
    guestName: "",
    suiteName: "",
    checkInDate: new Date().toISOString().slice(0, 10),
    amountPaid: "",
    paymentMethod: "Cash",
    note: ""
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chosen && suiteDepartments[0]?.id) setChosen(suiteDepartments[0].id);
  }, [chosen, suiteDepartments]);

  async function load(id: string) {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers = await authHeaders();
    const response = await fetch(`/api/suites?departmentId=${id}`, { headers });
    const payload = await response.json();
    if (!response.ok && payload.suite === false) {
      setSuite(false);
      setEntries([]);
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Failed to load check-ins");
    setSuite(Boolean(payload.suite));
    setNeedsMigration(Boolean(payload.needsMigration));
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
    setNotice("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/suites", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: chosen,
          guestName: form.guestName,
          suiteName: form.suiteName,
          checkInDate: form.checkInDate,
          amountPaid: Number(form.amountPaid || 0),
          paymentMethod: form.paymentMethod,
          note: form.note
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setForm({
        guestName: "",
        suiteName: form.suiteName,
        checkInDate: new Date().toISOString().slice(0, 10),
        amountPaid: "",
        paymentMethod: form.paymentMethod,
        note: ""
      });
      setNotice("Check-in recorded.");
      await load(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Stewardship</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Check-ins</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Record which suite a guest checked into and how much was paid. This is not the Banking and Finance cash book.
        </p>
      </div>
      {needsMigration && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Run <span className="font-semibold">supabase/migrations/202610210003_suite_checkins.sql</span> in the Supabase SQL editor, then refresh.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
      {suiteDepartments.length > 1 && (
        <select className="form-control w-full sm:max-w-md" value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {suiteDepartments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.subsidiaryName ? `${item.subsidiaryName} · ` : ""}
              {item.name}
            </option>
          ))}
        </select>
      )}
      {!suite && <p className="text-sm text-slate-600">This login is not a Suite desk.</p>}
      {suite && (
        <>
          <form onSubmit={save} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">Guest name</span>
              <input className="form-control" required value={form.guestName} onChange={(event) => setForm({ ...form, guestName: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Suite</span>
              <input className="form-control" required placeholder="Suite 1" value={form.suiteName} onChange={(event) => setForm({ ...form, suiteName: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Check-in date</span>
              <input type="date" className="form-control" required value={form.checkInDate} onChange={(event) => setForm({ ...form, checkInDate: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Amount paid</span>
              <input className="form-control" inputMode="decimal" required value={form.amountPaid} onChange={(event) => setForm({ ...form, amountPaid: event.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Payment</span>
              <select className="form-control" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}>
                <option>Cash</option>
                <option>Transfer</option>
                <option>POS</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Note</span>
              <input className="form-control" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={busy} className="primary-button w-full sm:w-auto disabled:opacity-60">
                {busy ? "Saving..." : "Record check-in"}
              </button>
            </div>
          </form>
          {loading ? (
            <ListLoader label="Loading check-ins…" />
          ) : (
          <div className="space-y-3">
            {entries.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{item.guest_name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {item.suite_name} · checked in {item.check_in_date}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-slate-950">{naira(item.amount_paid)}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {[item.payment_method, item.note].filter(Boolean).join(" · ")}
                </p>
              </article>
            ))}
            {!entries.length && (
              <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No check-ins recorded yet.
              </p>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
