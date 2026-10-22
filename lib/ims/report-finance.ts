export const FUNDS_DESTINATIONS = ["department_account", "held_at_desk"] as const;
export type FundsDestination = (typeof FUNDS_DESTINATIONS)[number];

export type ReportFinanceKind = "operating" | "cost_centre" | "money_arm" | "suite";

export type ReportFinance = {
  kind: ReportFinanceKind;
  billedLabel: string;
  collectedLabel: string;
  spentLabel: string;
  showBilled: boolean;
  showCollected: boolean;
  showDestination: boolean;
  note: string;
};

const COST_CENTRE_CODES = new Set(["HDO", "ADM", "HR", "AUA", "STP", "LGL", "AUB"]);
const COST_CENTRE_NAMES = new Set([
  "head office",
  "corporate administration",
  "hr",
  "audit",
  "strategy and partnerships",
  "legal"
]);

const SUITE_CODES = new Set(["SUI"]);
const MONEY_ARM_CODES = new Set(["MCT", "INV"]);

type DeskKey = { code?: string | null; name?: string | null };

function codeOf(desk?: DeskKey | null) {
  return String(desk?.code ?? "").trim().toUpperCase();
}

function nameOf(desk?: DeskKey | null) {
  return String(desk?.name ?? "").trim().toLowerCase();
}

function isCostCentre(desk?: DeskKey | null) {
  const code = codeOf(desk);
  if (COST_CENTRE_CODES.has(code)) return true;
  const name = nameOf(desk);
  if (code === "AUB") return true;
  if (COST_CENTRE_NAMES.has(name) && code !== "MCT" && code !== "INV") return true;
  return false;
}

const operatingLabels: Record<string, Pick<ReportFinance, "billedLabel" | "collectedLabel" | "spentLabel">> = {
  ICT: { billedLabel: "Work billed today", collectedLabel: "Payments received", spentLabel: "Spend today" },
  PRT: { billedLabel: "Jobs billed today", collectedLabel: "Payments received", spentLabel: "Materials spend" },
  MDA: { billedLabel: "Productions billed today", collectedLabel: "Payments received", spentLabel: "Production spend" },
  REN: { billedLabel: "Installations billed today", collectedLabel: "Payments received", spentLabel: "Materials and site spend" },
  TRN: { billedLabel: "Fares and hires billed", collectedLabel: "Takings received", spentLabel: "Fuel, tolls and maintenance" },
  LOG: { billedLabel: "Fares and hires billed", collectedLabel: "Takings received", spentLabel: "Fuel, tolls and maintenance" },
  RES: { billedLabel: "Rent and sales billed", collectedLabel: "Collections received", spentLabel: "Property spend" },
  CST: { billedLabel: "Work billed today", collectedLabel: "Collections received", spentLabel: "Site spend" },
  OIL: { billedLabel: "Sales billed today", collectedLabel: "Collections received", spentLabel: "Operating spend" },
  GHG: { billedLabel: "Produce billed today", collectedLabel: "Sales collected", spentLabel: "Farm spend" },
  LIV: { billedLabel: "Produce billed today", collectedLabel: "Sales collected", spentLabel: "Farm spend" },
  EBM: { billedLabel: "Fees billed today", collectedLabel: "Fees collected", spentLabel: "School spend" },
  TES: { billedLabel: "Fees billed today", collectedLabel: "Fees collected", spentLabel: "School spend" },
  CLN: { billedLabel: "Services billed today", collectedLabel: "Payments received", spentLabel: "Clinic spend" },
  PHA: { billedLabel: "Sales billed today", collectedLabel: "Payments received", spentLabel: "Pharmacy spend" },
  SUI: { billedLabel: "Room charges billed", collectedLabel: "Amounts collected", spentLabel: "Supplies spend" },
  MCT: { billedLabel: "Receipts booked today", collectedLabel: "Cash taken in", spentLabel: "Disbursements and spend" },
  INV: { billedLabel: "Placements booked today", collectedLabel: "Inflows received", spentLabel: "Outflows and spend" }
};

const operatingNote =
  "Collections go into this department's own account with your Executive Director. This is not the Banking and Finance cash book.";
const costCentreNote =
  "This desk does not take in revenue. Report only today's spend. Your Executive Director holds the department account.";
const moneyArmNote =
  "Daily pulse only. The cash book remains the Banking and Finance trail. This department still banks with its Executive Director.";
const suiteNote =
  "Daily pulse only. Guest check-ins stay on Check-ins. Collections belong to the Suite account with your Executive Director.";

export function reportFinance(desk?: DeskKey | null): ReportFinance {
  const code = codeOf(desk);
  const name = nameOf(desk);
  if (SUITE_CODES.has(code) || name === "suite") {
    return {
      kind: "suite",
      ...operatingLabels.SUI,
      showBilled: true,
      showCollected: true,
      showDestination: true,
      note: suiteNote
    };
  }
  if (MONEY_ARM_CODES.has(code) || name.includes("microcredit") || name === "investment") {
    const labels = operatingLabels[code] ?? operatingLabels.MCT;
    return {
      kind: "money_arm",
      ...labels,
      showBilled: true,
      showCollected: true,
      showDestination: true,
      note: moneyArmNote
    };
  }
  if (isCostCentre(desk)) {
    return {
      kind: "cost_centre",
      billedLabel: "Billed today",
      collectedLabel: "Collected today",
      spentLabel: "Spend today",
      showBilled: false,
      showCollected: false,
      showDestination: false,
      note: costCentreNote
    };
  }
  const labels = operatingLabels[code] ?? {
    billedLabel: "Billed today",
    collectedLabel: "Collected today",
    spentLabel: "Spend today"
  };
  return {
    kind: "operating",
    ...labels,
    showBilled: true,
    showCollected: true,
    showDestination: true,
    note: operatingNote
  };
}

export function fundsDestinationLabel(
  value?: string | null,
  departmentName?: string | null
) {
  if (value === "held_at_desk") return "Still at the desk";
  if (value === "department_account") {
    return departmentName
      ? `Paid into the ${departmentName} account (Executive Director)`
      : "Paid into this department's account (Executive Director)";
  }
  return "";
}

export function isFundsDestination(value: string): value is FundsDestination {
  return FUNDS_DESTINATIONS.includes(value as FundsDestination);
}
