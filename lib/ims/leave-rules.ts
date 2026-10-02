export type LeaveCode =
  | "annual"
  | "sick"
  | "maternity"
  | "paternity"
  | "compassionate"
  | "examination"
  | "unpaid"
  | "emergency";

export type PayStatus = "unpaid" | "not_confirmed";

export const leaveRules: Record<
  LeaveCode,
  { pay: PayStatus; document: boolean; minDays: number | null; maxDays: number | null; usesBalance: boolean; label: string }
> = {
  annual: { pay: "unpaid", document: true, minDays: null, maxDays: null, usesBalance: true, label: "Annual" },
  sick: { pay: "unpaid", document: true, minDays: 2, maxDays: 5, usesBalance: false, label: "Sick" },
  maternity: { pay: "not_confirmed", document: true, minDays: null, maxDays: null, usesBalance: false, label: "Maternity" },
  paternity: { pay: "not_confirmed", document: true, minDays: null, maxDays: null, usesBalance: false, label: "Paternity" },
  compassionate: { pay: "not_confirmed", document: true, minDays: null, maxDays: null, usesBalance: false, label: "Compassionate" },
  examination: { pay: "unpaid", document: true, minDays: null, maxDays: null, usesBalance: false, label: "Examination or study" },
  unpaid: { pay: "unpaid", document: false, minDays: null, maxDays: null, usesBalance: false, label: "Unpaid" },
  emergency: { pay: "unpaid", document: true, minDays: null, maxDays: null, usesBalance: false, label: "Emergency" }
};

const limitedStatuses = new Set(["nysc", "intern"]);
const limitedAllowed = new Set<LeaveCode>(["emergency", "unpaid"]);

export function workingDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function leaveRequestError(input: {
  leaveType: LeaveCode;
  staffStatus: string;
  workingDays: number;
  annualLeaveDays: number;
  annualDaysUsed: number;
  hasDocument: boolean;
}) {
  const rule = leaveRules[input.leaveType];
  if (!rule) return "Unknown leave type";
  if (limitedStatuses.has(input.staffStatus) && !limitedAllowed.has(input.leaveType)) {
    return "NYSC members and interns can only request emergency leave or unpaid leave on request";
  }
  if (input.workingDays < 1) return "Choose a date range that includes at least one working day";
  if (rule.minDays != null && input.workingDays < rule.minDays) {
    return `${rule.label} leave must be at least ${rule.minDays} working days`;
  }
  if (rule.maxDays != null && input.workingDays > rule.maxDays) {
    return `${rule.label} leave cannot be more than ${rule.maxDays} working days`;
  }
  if (rule.document && !input.hasDocument) return `${rule.label} leave needs a supporting document`;
  if (rule.usesBalance && input.annualDaysUsed + input.workingDays > input.annualLeaveDays) {
    const remaining = Math.max(input.annualLeaveDays - input.annualDaysUsed, 0);
    return `This request is refused. ${remaining} unpaid annual day${remaining === 1 ? "" : "s"} remain this year`;
  }
  return null;
}
