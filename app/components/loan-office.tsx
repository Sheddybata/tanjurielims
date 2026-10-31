"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { DepartmentRow } from "@/lib/ims/data";
import { isLoanDesk } from "@/lib/ims/service";
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

function borrowerOf(row: any) {
  return Array.isArray(row?.loan_borrowers) ? row.loan_borrowers[0] : row?.loan_borrowers;
}

export function LoanOffice({
  departments,
  departmentId,
  canWrite = true
}: {
  departments: DepartmentRow[];
  departmentId?: string;
  canWrite?: boolean;
}) {
  const loanDepartments = departments.filter((item) => isLoanDesk(item));
  const [chosen, setChosen] = useState(
    departmentId && loanDepartments.some((item) => item.id === departmentId)
      ? departmentId
      : loanDepartments[0]?.id ?? departmentId ?? ""
  );
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loanBook, setLoanBook] = useState(loanDepartments.length > 0);
  const [activeCount, setActiveCount] = useState(0);
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [collectedToday, setCollectedToday] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loanForm, setLoanForm] = useState({
    fullName: "",
    phone: "",
    address: "",
    principal: "",
    totalDue: "",
    installmentAmount: "",
    frequency: "weekly",
    disbursedOn: new Date().toISOString().slice(0, 10),
    nextDueOn: "",
    purpose: ""
  });
  const [payForm, setPayForm] = useState({
    amount: "",
    paidOn: new Date().toISOString().slice(0, 10),
    method: "cash",
    note: ""
  });

  useEffect(() => {
    if (!chosen && loanDepartments[0]?.id) setChosen(loanDepartments[0].id);
  }, [chosen, loanDepartments]);

  async function loadList(id: string, search?: string) {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers = await authHeaders();
    const params = new URLSearchParams({ departmentId: id });
    if (search) params.set("q", search);
    const response = await fetch(`/api/loans?${params.toString()}`, { headers });
    const payload = await response.json();
    if (!response.ok && payload.loans === false) {
      setLoanBook(false);
      setItems([]);
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Failed to load loans");
    setLoanBook(Boolean(payload.loans));
    setNeedsMigration(Boolean(payload.needsMigration));
    setItems(payload.items ?? []);
    setActiveCount(Number(payload.activeCount ?? 0));
    setOutstandingTotal(Number(payload.outstandingTotal ?? 0));
    setCollectedToday(Number(payload.collectedToday ?? 0));
  }

  async function loadPayments(id: string, loanId: string) {
    const headers = await authHeaders();
    const params = new URLSearchParams({ departmentId: id, id: loanId });
    const response = await fetch(`/api/loans?${params.toString()}`, { headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load payments");
    setPayments(payload.payments ?? []);
    if (payload.items?.[0]) {
      setItems((current) => current.map((row) => (row.id === payload.items[0].id ? payload.items[0] : row)));
    }
  }

  useEffect(() => {
    loadList(chosen, query)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [chosen]);

  useEffect(() => {
    if (!chosen || !selectedId) {
      setPayments([]);
      return;
    }
    loadPayments(chosen, selectedId).catch((err) => setError(err instanceof Error ? err.message : "Failed to load payments"));
  }, [chosen, selectedId]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  async function openLoan(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/loans", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: chosen,
          fullName: loanForm.fullName,
          phone: loanForm.phone,
          address: loanForm.address,
          principal: Number(loanForm.principal || 0),
          totalDue: Number(loanForm.totalDue || loanForm.principal || 0),
          installmentAmount: loanForm.installmentAmount ? Number(loanForm.installmentAmount) : null,
          frequency: loanForm.frequency,
          disbursedOn: loanForm.disbursedOn,
          nextDueOn: loanForm.nextDueOn || null,
          purpose: loanForm.purpose
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not open the loan");
      setLoanForm({
        fullName: "",
        phone: "",
        address: "",
        principal: "",
        totalDue: "",
        installmentAmount: "",
        frequency: "weekly",
        disbursedOn: new Date().toISOString().slice(0, 10),
        nextDueOn: "",
        purpose: ""
      });
      setShowNew(false);
      setNotice(`Loan ${payload.loan.display_code} opened.`);
      setSelectedId(payload.loan.id);
      await loadList(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the loan");
    } finally {
      setBusy(false);
    }
  }

  async function collect(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/loans/payments", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: selected.id,
          amount: Number(payForm.amount || 0),
          paidOn: payForm.paidOn,
          method: payForm.method,
          note: payForm.note
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not record the payment");
      setPayForm({ amount: "", paidOn: new Date().toISOString().slice(0, 10), method: payForm.method, note: "" });
      setNotice(payload.status === "paid" ? "Loan paid off." : `Payment recorded. Balance ${naira(payload.outstanding)}.`);
      await loadList(chosen, query);
      await loadPayments(chosen, selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    setError("");
    setSelectedId(null);
    setLoading(true);
    try {
      await loadList(chosen, query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="hidden sm:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-800">Counter</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Loans</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Borrowers do not need a phone. When someone pays at the desk, the manager or teller finds the loan and records the amount.
        </p>
      </div>
      {needsMigration && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Run <span className="font-semibold">supabase/migrations/202610230001_loan_book.sql</span> in the Supabase SQL editor, then refresh.
        </div>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
      {loanDepartments.length > 1 && (
        <select className="form-control w-full sm:max-w-md" value={chosen} onChange={(event) => { setChosen(event.target.value); setSelectedId(null); }}>
          {loanDepartments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.subsidiaryName ? `${item.subsidiaryName} · ` : ""}
              {item.name}
            </option>
          ))}
        </select>
      )}
      {!loanBook && <p className="text-sm text-slate-600">Loan book is only for Microcredit and Banking desks.</p>}
      {loanBook && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Active</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{activeCount}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Outstanding</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{naira(outstandingTotal)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Collected today</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{naira(collectedToday)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="form-control flex-1"
              placeholder="Search name, phone, or loan number"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
            />
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" className="secondary-button w-full sm:w-auto" onClick={() => void search()}>
                Find
              </button>
              {canWrite && (
                <button type="button" className="primary-button w-full sm:w-auto" onClick={() => setShowNew(true)}>
                  + New loan
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <ListLoader label="Loading loans…" variant="cards" />
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const person = borrowerOf(item);
                const open = selectedId === item.id;
                return (
                  <article key={item.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                    <button type="button" className="w-full text-left" onClick={() => setSelectedId(open ? null : item.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{person?.full_name ?? "Borrower"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.display_code}
                            {person?.phone ? ` · ${person.phone}` : ""}
                          </p>
                        </div>
                        <span className={`pill ${item.status === "paid" ? "bg-green-50 text-green-700 ring-green-200" : item.status === "defaulted" ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                          {item.status === "paid" ? "Paid" : item.status === "defaulted" ? "Defaulted" : "Active"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        Balance {naira(item.outstanding)} · Recover {naira(item.total_due)}
                      </p>
                    </button>
                    {open && (
                      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                        <p className="text-sm text-slate-600">
                          Given {naira(item.principal)} on {item.disbursed_on}
                          {item.installment_amount ? ` · ${naira(item.installment_amount)} ${item.frequency.replace("_", " ")}` : ""}
                          {item.next_due_on ? ` · Next due ${item.next_due_on}` : ""}
                        </p>
                        {canWrite && item.status === "active" && (
                          <form onSubmit={collect} className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="field-label">Amount paid now</span>
                              <input className="form-control" inputMode="decimal" required value={payForm.amount} onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })} />
                            </label>
                            <label className="block">
                              <span className="field-label">Date</span>
                              <input type="date" className="form-control" required value={payForm.paidOn} onChange={(event) => setPayForm({ ...payForm, paidOn: event.target.value })} />
                            </label>
                            <label className="block">
                              <span className="field-label">How they paid</span>
                              <select className="form-control" value={payForm.method} onChange={(event) => setPayForm({ ...payForm, method: event.target.value })}>
                                <option value="cash">Cash at the desk</option>
                                <option value="transfer">Transfer</option>
                                <option value="pos">POS</option>
                              </select>
                            </label>
                            <label className="block">
                              <span className="field-label">Note</span>
                              <input className="form-control" value={payForm.note} onChange={(event) => setPayForm({ ...payForm, note: event.target.value })} />
                            </label>
                            <div className="sm:col-span-2">
                              <button type="submit" disabled={busy} className="primary-button w-full disabled:opacity-60">
                                {busy ? "Saving..." : "Record payment"}
                              </button>
                            </div>
                          </form>
                        )}
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Payments</p>
                          {payments.map((payment) => {
                            const receiver = Array.isArray(payment.profiles) ? payment.profiles[0] : payment.profiles;
                            return (
                              <p key={payment.id} className="text-sm text-slate-700">
                                {payment.paid_on} · {naira(payment.amount)} · {payment.method}
                                {receiver?.full_name ? ` · ${receiver.full_name}` : ""}
                              </p>
                            );
                          })}
                          {!payments.length && <p className="text-sm text-slate-500">No repayment recorded yet.</p>}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {!items.length && (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No loans on this desk yet. Open one when money is given out.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6" onClick={() => setShowNew(false)} role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Counter</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">Open a loan</h3>
              </div>
              <button type="button" className="secondary-button px-3 py-2 text-sm" onClick={() => setShowNew(false)}>
                Close
              </button>
            </div>
            <form onSubmit={openLoan} className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="field-label">Borrower name</span>
                <input className="form-control" required value={loanForm.fullName} onChange={(event) => setLoanForm({ ...loanForm, fullName: event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Phone</span>
                <input className="form-control" value={loanForm.phone} onChange={(event) => setLoanForm({ ...loanForm, phone: event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Address</span>
                <input className="form-control" value={loanForm.address} onChange={(event) => setLoanForm({ ...loanForm, address: event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Amount given</span>
                <input className="form-control" inputMode="decimal" required value={loanForm.principal} onChange={(event) => setLoanForm({ ...loanForm, principal: event.target.value, totalDue: loanForm.totalDue || event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Amount to recover</span>
                <input className="form-control" inputMode="decimal" required value={loanForm.totalDue} onChange={(event) => setLoanForm({ ...loanForm, totalDue: event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Installment</span>
                <input className="form-control" inputMode="decimal" value={loanForm.installmentAmount} onChange={(event) => setLoanForm({ ...loanForm, installmentAmount: event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">How often</span>
                <select className="form-control" value={loanForm.frequency} onChange={(event) => setLoanForm({ ...loanForm, frequency: event.target.value })}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="lump_sum">Lump sum</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label">Given on</span>
                <input type="date" className="form-control" required value={loanForm.disbursedOn} onChange={(event) => setLoanForm({ ...loanForm, disbursedOn: event.target.value })} />
              </label>
              <label className="block">
                <span className="field-label">Next due</span>
                <input type="date" className="form-control" value={loanForm.nextDueOn} onChange={(event) => setLoanForm({ ...loanForm, nextDueOn: event.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="field-label">Purpose</span>
                <input className="form-control" value={loanForm.purpose} onChange={(event) => setLoanForm({ ...loanForm, purpose: event.target.value })} />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" disabled={busy} className="primary-button w-full disabled:opacity-60">
                  {busy ? "Saving..." : "Open loan"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
