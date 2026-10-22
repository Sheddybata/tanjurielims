export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "cancelled"
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const requestStatusLabel: Record<RequestStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  needs_information: "Needs information",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled"
};

export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "in_progress"
];

export const MONEY_DEPARTMENT_CODES = ["MCT", "INV", "AUB"];
export const MONEY_SUBSIDIARY_CODES = ["BIF"];
export const SUITE_DEPARTMENT_CODES = ["SUI"];

export function generateRequestReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `TAN-REQ-${stamp}-${rand}`;
}

export function isBankingFinance(department?: {
  code?: string | null;
  name?: string | null;
  subsidiaryCode?: string | null;
  subsidiaryName?: string | null;
} | null) {
  if (!department) return false;
  if (department.subsidiaryCode && MONEY_SUBSIDIARY_CODES.includes(department.subsidiaryCode)) return true;
  if (department.code && MONEY_DEPARTMENT_CODES.includes(department.code)) return true;
  const subsidiaryName = String(department.subsidiaryName ?? "").toLowerCase();
  return subsidiaryName.includes("banking") && subsidiaryName.includes("finance");
}

export function isMoneyDepartment(department?: {
  code?: string | null;
  name?: string | null;
  subsidiaryCode?: string | null;
  subsidiaryName?: string | null;
} | null) {
  return isBankingFinance(department);
}

export function isSuiteDepartment(department?: { code?: string | null; name?: string | null } | null) {
  if (!department) return false;
  if (department.code && SUITE_DEPARTMENT_CODES.includes(department.code)) return true;
  return String(department.name ?? "").trim().toLowerCase() === "suite";
}

export type RequestQuestion = {
  key: string;
  label: string;
  type: "text" | "textarea" | "date" | "select" | "leave_type";
  required?: boolean;
  options?: string[];
};

export const CATEGORY_FALLBACK_QUESTIONS: Record<string, RequestQuestion[]> = {
  leave: [
    { key: "leaveType", label: "Leave type", type: "leave_type", required: true },
    { key: "startDate", label: "Start date", type: "date", required: true },
    { key: "endDate", label: "End date", type: "date", required: true },
    { key: "documentNote", label: "Supporting document note", type: "textarea", required: false }
  ],
  permission: [
    { key: "fromDate", label: "From", type: "date", required: true },
    { key: "toDate", label: "To", type: "date", required: true },
    { key: "reason", label: "Reason", type: "textarea", required: true }
  ],
  equipment: [
    { key: "item", label: "What do you need?", type: "text", required: true },
    { key: "reason", label: "Why", type: "textarea", required: true },
    { key: "urgency", label: "Urgency", type: "select", required: true, options: ["Normal", "Soon", "Urgent"] }
  ],
  maintenance: [
    { key: "assetCode", label: "Asset ID (if known)", type: "text", required: false },
    { key: "fault", label: "What is wrong?", type: "textarea", required: true },
    { key: "location", label: "Where", type: "text", required: false }
  ],
  it_support: [
    { key: "system", label: "System or device", type: "text", required: true },
    { key: "issue", label: "Issue", type: "textarea", required: true },
    { key: "urgency", label: "Urgency", type: "select", required: true, options: ["Normal", "Soon", "Urgent"] }
  ],
  general_office: [
    { key: "what", label: "What do you need?", type: "text", required: true },
    { key: "details", label: "Details", type: "textarea", required: true }
  ]
};

export function canRaiseForTeam(role?: string | null) {
  return role === "manager" || role === "department_head" || role === "department-head";
}

export function isMissingTableError(error?: { message?: string; code?: string } | null) {
  const message = error?.message ?? "";
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    error?.code === "PGRST205" ||
    error?.code === "42P01"
  );
}

export const FALLBACK_CATEGORIES = [
  {
    id: "local-leave",
    slug: "leave",
    name: "Leave",
    description: "Annual, sick, maternity, paternity, compassionate, and the other Tanjuriel leave types.",
    needs_fulfilment: false,
    is_leave: true,
    fulfil_department_code: null,
    questions: CATEGORY_FALLBACK_QUESTIONS.leave,
    is_active: true
  },
  {
    id: "local-permission",
    slug: "permission",
    name: "Permission",
    description: "Short permission to be away. Done once approved.",
    needs_fulfilment: false,
    is_leave: false,
    fulfil_department_code: null,
    questions: CATEGORY_FALLBACK_QUESTIONS.permission,
    is_active: true
  },
  {
    id: "local-equipment",
    slug: "equipment",
    name: "Equipment",
    description: "Request an item for yourself or someone in your department.",
    needs_fulfilment: true,
    is_leave: false,
    fulfil_department_code: "ICT",
    questions: CATEGORY_FALLBACK_QUESTIONS.equipment,
    is_active: true
  },
  {
    id: "local-maintenance",
    slug: "maintenance",
    name: "Maintenance",
    description: "Report a fault. Approved, then carried out.",
    needs_fulfilment: true,
    is_leave: false,
    fulfil_department_code: null,
    questions: CATEGORY_FALLBACK_QUESTIONS.maintenance,
    is_active: true
  },
  {
    id: "local-it_support",
    slug: "it_support",
    name: "IT support",
    description: "System or device issues for yourself or your staff.",
    needs_fulfilment: true,
    is_leave: false,
    fulfil_department_code: "ICT",
    questions: CATEGORY_FALLBACK_QUESTIONS.it_support,
    is_active: true
  }
];

export function questionsForCategory(category?: { slug?: string; questions?: unknown } | null): RequestQuestion[] {
  if (!category) return [];
  const raw = category.questions;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
  }
  const fromDb = Array.isArray(parsed) ? (parsed as RequestQuestion[]) : [];
  const fallback = CATEGORY_FALLBACK_QUESTIONS[category.slug ?? ""] ?? [];
  const questions = fromDb.length ? fromDb : fallback;
  if (category.slug === "leave" && !questions.some((item) => item.key === "leaveType" || item.type === "leave_type")) {
    return [...CATEGORY_FALLBACK_QUESTIONS.leave];
  }
  return questions;
}
