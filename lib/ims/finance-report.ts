export const FINANCE_REPORT_MARK = "[[finance-report]]";

export const FINANCE_CATEGORIES = [
  "Diesel",
  "Equipment hiring",
  "Maintenance and repairs",
  "Labour",
  "Petrol",
  "Transport and logistics",
  "Oil and lubricants",
  "Staff welfare",
  "Project labour cost",
  "Sundry expenses",
  "Office expenses"
] as const;

export type BankLine = {
  name: string;
  opening: string;
  receipts: string;
  transfers: string;
  expenditure: string;
};

export type CategoryLine = {
  name: string;
  amount: string;
};

export type PaymentLine = {
  date: string;
  particulars: string;
  purpose: string;
  amount: string;
};

export type FuelLine = {
  date: string;
  litres: string;
  rate: string;
  amount: string;
};

export type FinanceReportForm = {
  version: 1;
  to: string;
  throughMd: string;
  throughGm: string;
  from: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  summary: string;
  banks: BankLine[];
  categories: CategoryLine[];
  payments: PaymentLine[];
  diesel: FuelLine[];
  petrol: FuelLine[];
  observations: string[];
  conclusion: string;
  preparedBy: string;
  preparedTitle: string;
};

export function money(value: string) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoney(value: number) {
  return value.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function blankBank(): BankLine {
  return { name: "", opening: "", receipts: "", transfers: "", expenditure: "" };
}

export function blankPayment(): PaymentLine {
  return { date: "", particulars: "", purpose: "", amount: "" };
}

export function blankFuel(): FuelLine {
  return { date: "", litres: "", rate: "", amount: "" };
}

export function bankClosing(bank: BankLine) {
  return money(bank.opening) + money(bank.receipts) + money(bank.transfers) - money(bank.expenditure);
}

export function fuelAmount(line: FuelLine) {
  if (line.amount.trim()) return money(line.amount);
  const litres = money(line.litres);
  const rate = money(line.rate);
  return litres && rate ? litres * rate : 0;
}

export function emptyFinanceReport(preparedBy = "", reportDate = ""): FinanceReportForm {
  return {
    version: 1,
    to: "The Chairman",
    throughMd: "The Managing Director",
    throughGm: "The General Manager",
    from: "Accounts/Finance Department",
    reportDate,
    periodStart: "",
    periodEnd: "",
    currency: "Naira",
    summary: "",
    banks: [blankBank(), blankBank()],
    categories: FINANCE_CATEGORIES.map((name) => ({ name, amount: "" })),
    payments: [blankPayment(), blankPayment(), blankPayment()],
    diesel: [blankFuel(), blankFuel()],
    petrol: [blankFuel(), blankFuel()],
    observations: ["", "", ""],
    conclusion: "",
    preparedBy,
    preparedTitle: "Accountant"
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function list<T>(rows: unknown, map: (row: Record<string, unknown>) => T, empty: T): T[] {
  if (!Array.isArray(rows) || !rows.length) return [empty];
  return rows.map((row) => map(asRecord(row)));
}

export function normalizeFinanceReport(value: unknown, fallback?: FinanceReportForm): FinanceReportForm | null {
  const raw = asRecord(value);
  if (raw.version !== 1) return null;
  const base = fallback ?? emptyFinanceReport();
  const observations = Array.isArray(raw.observations) ? raw.observations.map(text) : base.observations;
  while (observations.length < 3) observations.push("");
  return {
    version: 1,
    to: text(raw.to) || base.to,
    throughMd: text(raw.throughMd) || base.throughMd,
    throughGm: text(raw.throughGm) || base.throughGm,
    from: text(raw.from) || base.from,
    reportDate: text(raw.reportDate) || base.reportDate,
    periodStart: text(raw.periodStart),
    periodEnd: text(raw.periodEnd),
    currency: text(raw.currency) || "Naira",
    summary: text(raw.summary),
    banks: list(
      raw.banks,
      (row) => ({
        name: text(row.name),
        opening: text(row.opening),
        receipts: text(row.receipts),
        transfers: text(row.transfers),
        expenditure: text(row.expenditure)
      }),
      blankBank()
    ),
    categories: list(
      raw.categories,
      (row) => ({ name: text(row.name), amount: text(row.amount) }),
      { name: "", amount: "" }
    ),
    payments: list(
      raw.payments,
      (row) => ({
        date: text(row.date),
        particulars: text(row.particulars),
        purpose: text(row.purpose),
        amount: text(row.amount)
      }),
      blankPayment()
    ),
    diesel: list(
      raw.diesel,
      (row) => ({ date: text(row.date), litres: text(row.litres), rate: text(row.rate), amount: text(row.amount) }),
      blankFuel()
    ),
    petrol: list(
      raw.petrol,
      (row) => ({ date: text(row.date), litres: text(row.litres), rate: text(row.rate), amount: text(row.amount) }),
      blankFuel()
    ),
    observations,
    conclusion: text(raw.conclusion),
    preparedBy: text(raw.preparedBy),
    preparedTitle: text(raw.preparedTitle) || "Accountant"
  };
}

export function splitFinanceReport(summary: string) {
  const index = summary.indexOf(FINANCE_REPORT_MARK);
  if (index < 0) return { text: summary, form: null as FinanceReportForm | null };
  const textPart = summary.slice(0, index).trim();
  const raw = summary.slice(index + FINANCE_REPORT_MARK.length).trim();
  try {
    const form = normalizeFinanceReport(JSON.parse(raw));
    return { text: textPart || (form ? "Finance report" : summary), form };
  } catch {
    return { text: textPart || "Finance report", form: null as FinanceReportForm | null };
  }
}

export function financeReportTotals(form: FinanceReportForm) {
  const categoryTotal = form.categories.reduce((sum, row) => sum + money(row.amount), 0);
  const paymentTotal = form.payments.reduce((sum, row) => sum + money(row.amount), 0);
  const receipts = form.banks.reduce((sum, row) => sum + money(row.receipts), 0);
  const closing = form.banks.reduce((sum, row) => sum + bankClosing(row), 0);
  const expenditure = paymentTotal || categoryTotal;
  return { categoryTotal, paymentTotal, receipts, closing, expenditure };
}

export function financeReportFields(form: FinanceReportForm) {
  const totals = financeReportTotals(form);
  const period = [form.periodStart.trim(), form.periodEnd.trim()].filter(Boolean).join(" to ");
  const categoryLines = form.categories
    .filter((row) => row.name.trim() && money(row.amount))
    .map((row) => `${row.name.trim()}: ${formatMoney(money(row.amount))}`)
    .join("\n");
  const observationText = form.observations.map((item) => item.trim()).filter(Boolean).join("\n");
  const headline = `Finance report${period ? ` · ${period}` : ""}`;
  const summary = [
    headline,
    totals.expenditure ? `Operational expenditure: ${formatMoney(totals.expenditure)}` : "",
    totals.closing ? `Closing bank balance: ${formatMoney(totals.closing)}` : "",
    "",
    FINANCE_REPORT_MARK,
    JSON.stringify(form)
  ].join("\n");
  return {
    expenses: totals.expenditure,
    revenue: 0,
    cashIn: 0,
    jobsCompleted: period || "Finance report",
    jobsInProgress: totals.closing ? `Closing balance ${formatMoney(totals.closing)}` : "",
    departmentUpdate: form.summary.trim(),
    currentProjects: categoryLines,
    upcomingProjects: form.conclusion.trim(),
    growthIdeas: "",
    challenges: observationText || "No observation recorded for this period.",
    summary
  };
}
