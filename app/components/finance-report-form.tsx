"use client";

import { useState } from "react";
import {
  bankClosing,
  blankBank,
  blankFuel,
  blankPayment,
  emptyFinanceReport,
  financeReportFields,
  financeReportTotals,
  formatMoney,
  fuelAmount,
  money,
  normalizeFinanceReport,
  type BankLine,
  type CategoryLine,
  type FinanceReportForm,
  type FuelLine,
  type PaymentLine
} from "@/lib/ims/finance-report";

type SavedReport = {
  id: string;
  dbId?: string;
  submittedBy: string;
  date: string;
  status: string;
  financeReport?: FinanceReportForm | null;
};

const STEPS = [
  { id: 1, label: "Banks" },
  { id: 2, label: "Categories" },
  { id: 3, label: "Payments" },
  { id: 4, label: "Fuel" },
  { id: 5, label: "Close" }
] as const;

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="form-control" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        className="form-control min-h-28 resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function periodLabel(form: FinanceReportForm) {
  return [form.periodStart, form.periodEnd].filter(Boolean).join(" to ");
}

export function FinanceReportView({ form }: { form: FinanceReportForm }) {
  const totals = financeReportTotals(form);
  const categories = form.categories.filter((row) => row.name.trim() && money(row.amount));
  const payments = form.payments.filter((row) => row.particulars.trim() || money(row.amount));
  const diesel = form.diesel.filter((row) => row.date || row.litres || row.amount);
  const petrol = form.petrol.filter((row) => row.date || row.litres || row.amount);
  const observations = form.observations.map((item) => item.trim()).filter(Boolean);

  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">Financial report</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="Reporting period" value={periodLabel(form)} />
          <Fact label="Date" value={form.reportDate} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">1. Executive summary</p>
        <p className="mt-3 whitespace-pre-wrap leading-6 text-slate-900">{form.summary.trim() || "No summary written."}</p>
      </section>

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">2. Summary of bank position</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {form.banks.map((bank, index) => (
            <BankCard key={index} bank={bank} />
          ))}
          <article className="rounded-2xl border border-slate-900 bg-slate-950 p-4 text-white">
            <p className="font-semibold">Combined</p>
            <dl className="mt-3 space-y-2">
              <Light label="Opening" value={formatMoney(form.banks.reduce((sum, bank) => sum + money(bank.opening), 0))} />
              <Light label="Receipts" value={formatMoney(totals.receipts)} />
              <Light
                label="Interbank transfers"
                value={formatMoney(form.banks.reduce((sum, bank) => sum + money(bank.transfers), 0))}
              />
              <Light
                label="Operational expenditure"
                value={formatMoney(form.banks.reduce((sum, bank) => sum + money(bank.expenditure), 0))}
              />
              <Light label="Closing balance" value={formatMoney(totals.closing)} />
            </dl>
          </article>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Interbank transfers are money moved between the company’s own accounts. They are not counted as expenses.
        </p>
      </section>

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">3. Expenditure by category</p>
        {categories.length ? (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((row) => (
                  <tr key={row.name} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{formatMoney(money(row.amount))}</td>
                    <td className="px-3 py-2">
                      {totals.categoryTotal ? `${((money(row.amount) / totals.categoryTotal) * 100).toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2">{formatMoney(totals.categoryTotal)}</td>
                  <td className="px-3 py-2">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-slate-500">No category amounts entered.</p>
        )}
      </section>

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">4. Detailed expenditure</p>
        {payments.length ? (
          <div className="mt-3 space-y-2">
            {payments.map((row, index) => (
              <article key={index} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-950">
                    {index + 1}. {row.particulars || "Payment"}
                  </p>
                  <p className="shrink-0 font-semibold">{formatMoney(money(row.amount))}</p>
                </div>
                <p className="mt-1 text-slate-600">
                  {[row.date, row.purpose].filter(Boolean).join(" · ")}
                </p>
              </article>
            ))}
            <p className="text-sm font-semibold text-slate-950">Total expenditure {formatMoney(totals.paymentTotal)}</p>
          </div>
        ) : (
          <p className="mt-2 text-slate-500">No payments entered.</p>
        )}
      </section>

      <FuelBlock title="5.1 Diesel purchases" rows={diesel} />
      <FuelBlock title="5.2 Petrol purchases" rows={petrol} />

      <section className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">6. Key financial observations</p>
        {observations.length ? (
          <ol className="mt-3 list-decimal space-y-2 pl-5 leading-6 text-slate-900">
            {observations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-slate-500">No observation recorded.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">7. Conclusion</p>
        <p className="mt-3 whitespace-pre-wrap leading-6 text-slate-900">{form.conclusion.trim() || "No conclusion written."}</p>
        <p className="mt-4 text-slate-700">
          Prepared by {form.preparedBy || "—"}
          {form.preparedTitle ? `, ${form.preparedTitle}` : ""}
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-900">{value}</dd>
    </div>
  );
}

function Light({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function BankCard({ bank }: { bank: BankLine }) {
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <p className="font-semibold text-slate-950">{bank.name.trim() || "Bank account"}</p>
      <dl className="mt-3 space-y-2">
        <Row label="Opening" value={formatMoney(money(bank.opening))} />
        <Row label="Receipts" value={formatMoney(money(bank.receipts))} />
        <Row label="Interbank transfers" value={formatMoney(money(bank.transfers))} />
        <Row label="Operational expenditure" value={formatMoney(money(bank.expenditure))} />
        <Row label="Closing balance" value={formatMoney(bankClosing(bank))} />
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function FuelBlock({ title, rows }: { title: string; rows: FuelLine[] }) {
  const totalLitres = rows.reduce((sum, row) => sum + money(row.litres), 0);
  const totalAmount = rows.reduce((sum, row) => sum + fuelAmount(row), 0);
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">{title}</p>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Date of usage</th>
                <th className="px-3 py-2">Litres</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.date || "—"}</td>
                  <td className="px-3 py-2">{row.litres || "—"}</td>
                  <td className="px-3 py-2">{row.rate || "—"}</td>
                  <td className="px-3 py-2">{formatMoney(fuelAmount(row))}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2">{totalLitres ? totalLitres.toLocaleString("en-NG") : "—"}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">{formatMoney(totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-slate-500">None recorded.</p>
      )}
    </section>
  );
}

export function FinanceReportForm({
  preparedBy,
  reports,
  onSubmit,
  onOpenReport
}: {
  preparedBy: string;
  reports: SavedReport[];
  onSubmit: (submission: {
    id: string;
    date: string;
    status: "Draft" | "Pending Chairman Review";
    priority: "Normal" | "Attention" | "Critical";
    revenue: number;
    inquiries: number;
    attendance: number;
    activeOperations: number;
    cashIn: number;
    expenses: number;
    assetsFlagged: number;
    jobsCompleted?: string;
    jobsInProgress?: string;
    equipmentStatus?: string[];
    departmentUpdate?: string;
    currentProjects?: string;
    upcomingProjects?: string;
    growthIdeas?: string;
    challenges?: string;
    summary: string;
    parentReportId?: string | null;
  }) => Promise<unknown>;
  onOpenReport?: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => emptyFinanceReport(preparedBy, today));
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resumeLabel, setResumeLabel] = useState("");
  const [parentReportId, setParentReportId] = useState<string | null>(null);
  const [sent, setSent] = useState("");
  const totals = financeReportTotals(form);

  const mine = reports.filter((item) => item.submittedBy === preparedBy && item.financeReport);
  const todayDraft = mine.find((item) => item.date === today && item.status === "Draft");
  const todayPending = mine.find((item) => item.date === today && item.status === "Pending Chairman Review");
  const todayReturned = mine.find((item) => item.date === today && item.status === "Returned");

  function load(report: SavedReport, mode: "draft" | "returned") {
    const next = normalizeFinanceReport(report.financeReport, emptyFinanceReport(preparedBy, report.date));
    if (!next) return;
    setForm(next);
    setParentReportId(mode === "returned" ? report.dbId || null : null);
    setResumeLabel(mode === "returned" ? `Fixing the returned report for ${report.date}` : `Continuing the draft for ${report.date}`);
    setError("");
    setSent("");
    setStep(1);
  }

  function patchRow<T>(key: "banks" | "categories" | "payments" | "diesel" | "petrol", index: number, patch: Partial<T>) {
    setForm((current) => {
      const rows = [...(current[key] as T[])];
      rows[index] = { ...rows[index], ...patch };
      return { ...current, [key]: rows };
    });
  }

  async function save(status: "Draft" | "Pending Chairman Review") {
    setError("");
    setSent("");
    if (status === "Pending Chairman Review") {
      const missing = [
        !form.periodStart.trim() && "Period start",
        !form.periodEnd.trim() && "Period end",
        !form.summary.trim() && "Executive summary"
      ].filter(Boolean);
      if (missing.length) {
        setStep(1);
        setError(`Complete this before you send it: ${missing.join(", ")}.`);
        return;
      }
    }
    const packed = financeReportFields(form);
    setSaving(true);
    try {
      await onSubmit({
        id: `IMS-${today.replace(/-/g, "")}-${Date.now().toString().slice(-6)}`,
        date: form.reportDate || today,
        status,
        priority: "Normal",
        revenue: packed.revenue,
        inquiries: 0,
        attendance: 0,
        activeOperations: form.payments.filter((row) => money(row.amount)).length,
        cashIn: packed.cashIn,
        expenses: packed.expenses,
        assetsFlagged: 0,
        jobsCompleted: packed.jobsCompleted,
        jobsInProgress: packed.jobsInProgress,
        departmentUpdate: packed.departmentUpdate,
        currentProjects: packed.currentProjects,
        upcomingProjects: packed.upcomingProjects,
        growthIdeas: packed.growthIdeas,
        challenges: packed.challenges,
        summary: packed.summary,
        parentReportId
      });
      setForm(emptyFinanceReport(preparedBy, today));
      setParentReportId(null);
      setResumeLabel("");
      setStep(1);
      setSent(status === "Draft" ? "Draft saved." : "Sent to the Executive Director.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Finance and procurement</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-950">File the financial report</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          One report covers the period you choose. Record what came in, what was spent, and the bank balance left. Money moved
          between the company’s own accounts is a transfer, not an expense.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
        {todayPending ? (
          <p className="font-medium text-blue-800">
            A report dated today is already with the Executive Director.
            {onOpenReport ? (
              <button type="button" className="ml-2 font-semibold underline" onClick={() => onOpenReport(todayPending.id)}>
                Open it
              </button>
            ) : null}
          </p>
        ) : todayReturned ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-amber-900">Today’s report was returned. Load it, correct it, and send it again.</p>
            <button type="button" className="primary-button" onClick={() => load(todayReturned, "returned")}>
              Fix and resubmit
            </button>
          </div>
        ) : todayDraft ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-slate-700">You have a draft for today.</p>
            <button type="button" className="secondary-button" onClick={() => load(todayDraft, "draft")}>
              Continue draft
            </button>
          </div>
        ) : (
          <p className="font-medium text-slate-600">No finance report for today yet. Start with the period.</p>
        )}
      </div>

      {resumeLabel ? <p className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">{resumeLabel}</p> : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {sent ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sent}</p> : null}

      <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStep(item.id)}
            className={`min-h-11 rounded-xl border px-1 py-2 text-[11px] font-semibold leading-tight sm:text-xs ${
              step === item.id
                ? "border-blue-700 bg-blue-700 text-white"
                : step > item.id
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {item.id}. {item.label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Period start *" value={form.periodStart} onChange={(periodStart) => setForm({ ...form, periodStart })} placeholder="YYYY-MM-DD" />
            <Field label="Period end *" value={form.periodEnd} onChange={(periodEnd) => setForm({ ...form, periodEnd })} placeholder="YYYY-MM-DD" />
          </div>
          <h4 className="font-semibold text-slate-950">1. Executive summary</h4>
          <Area
            label="What happened in this period *"
            value={form.summary}
            onChange={(summary) => setForm({ ...form, summary })}
            placeholder="Funds received, what the money was spent on, and the bank balance left."
          />
          <h4 className="font-semibold text-slate-950">2. Bank position</h4>
          <p className="text-sm text-slate-600">
            Name each company account. A transfer out of one account is a minus. The same amount into the other account is a plus.
            The combined transfer should come to zero.
          </p>
          {form.banks.map((bank, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <Field label="Bank account" value={bank.name} onChange={(name) => patchRow<BankLine>("banks", index, { name })} />
              <Field label="Opening balance" value={bank.opening} onChange={(opening) => patchRow<BankLine>("banks", index, { opening })} />
              <Field label="Receipts during the period" value={bank.receipts} onChange={(receipts) => patchRow<BankLine>("banks", index, { receipts })} />
              <Field label="Interbank transfers" value={bank.transfers} onChange={(transfers) => patchRow<BankLine>("banks", index, { transfers })} placeholder="Use a minus for money sent out" />
              <Field label="Operational expenditure" value={bank.expenditure} onChange={(expenditure) => patchRow<BankLine>("banks", index, { expenditure })} />
              <p className="self-end text-sm font-semibold text-slate-950">Closing balance {formatMoney(bankClosing(bank))}</p>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ ...form, banks: [...form.banks, blankBank()] })}>
            Add an account
          </button>
          <p className="text-sm font-semibold text-slate-950">Combined closing balance {formatMoney(totals.closing)}</p>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-slate-950">3. Expenditure by category</h4>
          {form.categories.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_10rem_5rem]">
              <Field label="Category" value={row.name} onChange={(name) => patchRow<CategoryLine>("categories", index, { name })} />
              <Field label="Amount" value={row.amount} onChange={(amount) => patchRow<CategoryLine>("categories", index, { amount })} />
              <p className="self-end pb-2 text-sm font-semibold text-slate-700">
                {totals.categoryTotal && money(row.amount) ? `${((money(row.amount) / totals.categoryTotal) * 100).toFixed(1)}%` : ""}
              </p>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setForm({ ...form, categories: [...form.categories, { name: "", amount: "" }] })}
          >
            Add a category
          </button>
          <p className="text-sm font-semibold text-slate-950">Category total {formatMoney(totals.categoryTotal)}</p>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-slate-950">4. Detailed expenditure</h4>
          {form.payments.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 sm:col-span-2">{index + 1}</p>
              <Field label="Date" value={row.date} onChange={(date) => patchRow<PaymentLine>("payments", index, { date })} placeholder="YYYY-MM-DD" />
              <Field label="Amount" value={row.amount} onChange={(amount) => patchRow<PaymentLine>("payments", index, { amount })} />
              <div className="sm:col-span-2">
                <Area label="Particulars" value={row.particulars} onChange={(particulars) => patchRow<PaymentLine>("payments", index, { particulars })} />
              </div>
              <div className="sm:col-span-2">
                <Field label="Designation / purpose" value={row.purpose} onChange={(purpose) => patchRow<PaymentLine>("payments", index, { purpose })} />
              </div>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ ...form, payments: [...form.payments, blankPayment()] })}>
            Add a payment
          </button>
          <p className="text-sm font-semibold text-slate-950">Total expenditure {formatMoney(totals.paymentTotal)}</p>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <FuelEditor
            title="5.1 Diesel purchases"
            rows={form.diesel}
            onChange={(index, patch) => patchRow<FuelLine>("diesel", index, patch)}
            onAdd={() => setForm({ ...form, diesel: [...form.diesel, blankFuel()] })}
          />
          <FuelEditor
            title="5.2 Petrol purchases"
            rows={form.petrol}
            onChange={(index, patch) => patchRow<FuelLine>("petrol", index, patch)}
            onAdd={() => setForm({ ...form, petrol: [...form.petrol, blankFuel()] })}
          />
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4">
          <h4 className="font-semibold text-slate-950">6. Key financial observations</h4>
          {form.observations.map((item, index) => (
            <Area
              key={index}
              label={`Observation ${index + 1}`}
              value={item}
              onChange={(value) => {
                const observations = [...form.observations];
                observations[index] = value;
                setForm({ ...form, observations });
              }}
            />
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setForm({ ...form, observations: [...form.observations, ""] })}
          >
            Add an observation
          </button>
          <h4 className="font-semibold text-slate-950">7. Conclusion</h4>
          <Area label="Conclusion" value={form.conclusion} onChange={(conclusion) => setForm({ ...form, conclusion })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Prepared by" value={form.preparedBy} onChange={(name) => setForm({ ...form, preparedBy: name })} />
            <Field label="Title" value={form.preparedTitle} onChange={(preparedTitle) => setForm({ ...form, preparedTitle })} />
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 1 ? (
          <button type="button" className="secondary-button" onClick={() => setStep((current) => current - 1)}>
            Back
          </button>
        ) : null}
        {step < 5 ? (
          <button type="button" className="primary-button" onClick={() => setStep((current) => current + 1)}>
            Next
          </button>
        ) : null}
        <button type="button" className="secondary-button" disabled={saving} onClick={() => void save("Draft")}>
          Save draft
        </button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void save("Pending Chairman Review")}>
          {saving ? "Sending…" : "Send to Executive Director"}
        </button>
      </div>
    </div>
  );
}

function FuelEditor({
  title,
  rows,
  onChange,
  onAdd
}: {
  title: string;
  rows: FuelLine[];
  onChange: (index: number, patch: Partial<FuelLine>) => void;
  onAdd: () => void;
}) {
  const total = rows.reduce((sum, row) => sum + fuelAmount(row), 0);
  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-slate-950">{title}</h4>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
          <Field label="Date of usage" value={row.date} onChange={(date) => onChange(index, { date })} placeholder="YYYY-MM-DD" />
          <Field label="Litres" value={row.litres} onChange={(litres) => onChange(index, { litres })} />
          <Field label="Rate" value={row.rate} onChange={(rate) => onChange(index, { rate })} />
          <Field label="Amount" value={row.amount} onChange={(amount) => onChange(index, { amount })} placeholder={fuelAmount({ ...row, amount: "" }) ? formatMoney(fuelAmount({ ...row, amount: "" })) : ""} />
        </div>
      ))}
      <button type="button" className="secondary-button" onClick={onAdd}>
        Add a purchase
      </button>
      <p className="text-sm font-semibold text-slate-950">Total {formatMoney(total)}</p>
    </div>
  );
}
