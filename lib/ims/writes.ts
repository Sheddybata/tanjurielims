import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  marketingStatusToDb,
  statusToDb,
  type UiMarketingStatus,
  type UiPriority,
  type UiSubmissionStatus
} from "@/lib/ims/mappers";

export type ReportWriteInput = {
  displayCode: string;
  departmentId: string;
  submittedBy: string;
  reportingDate: string;
  status: UiSubmissionStatus;
  priority: UiPriority;
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
  fundsDestination?: string | null;
};

export async function createDailyReport(input: ReportWriteInput) {
  const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("You must be signed in.");
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Failed to save report");
  if (!payload.report) throw new Error("Failed to save report");
  return payload.report as { id: string; display_code: string };
}

export async function applyReportDecision(input: {
  dbReportId: string;
  previousStatus: UiSubmissionStatus;
  nextStatus: Exclude<UiSubmissionStatus, "Draft">;
  actorId: string;
  comment: string;
}) {
  const supabase = getSupabaseBrowser();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: statusToDb[input.nextStatus]
  };
  if (input.nextStatus === "Approved") patch.approved_at = now;
  if (input.nextStatus === "Returned") patch.returned_at = now;

  const { error: reportError } = await supabase.from("daily_reports").update(patch).eq("id", input.dbReportId);
  if (reportError) throw reportError;

  const { data, error } = await supabase
    .from("approval_actions")
    .insert({
      report_id: input.dbReportId,
      actor_id: input.actorId,
      previous_status: statusToDb[input.previousStatus],
      new_status: statusToDb[input.nextStatus],
      comment: input.comment
    })
    .select("id, created_at")
    .single();

  if (error) throw error;
  return data as { id: string; created_at: string };
}

export async function createMarketingLead(input: {
  client: string;
  visitDate: string;
  proposal: string;
  quotation: number;
  assignedDepartmentId: string;
  assignedBy: string;
  status: UiMarketingStatus;
  notes?: string;
}) {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("marketing_leads")
    .insert({
      client: input.client,
      visit_date: input.visitDate,
      proposal: input.proposal,
      quotation: input.quotation,
      assigned_department_id: input.assignedDepartmentId,
      assigned_by: input.assignedBy,
      status: marketingStatusToDb[input.status],
      notes: input.notes || null
    })
    .select("id")
    .single();
  if (error) throw error;
  return data as { id: string };
}

export async function createAsset(input: {
  assetId: string;
  name: string;
  classification: string;
  purchaseDate?: string | null;
  supplierName?: string;
  serialNumber?: string;
  departmentId: string;
  custodianName: string;
  warrantyExpiration?: string | null;
  maintenanceInterval?: string;
  location?: string;
  status: string;
  bookValue: number;
}) {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      asset_id: input.assetId,
      name: input.name,
      classification: input.classification,
      purchase_date: input.purchaseDate || null,
      supplier_name: input.supplierName || null,
      serial_number: input.serialNumber || null,
      department_id: input.departmentId,
      custodian_name: input.custodianName,
      warranty_expiration: input.warrantyExpiration || null,
      maintenance_schedule_interval: input.maintenanceInterval || null,
      location: input.location || null,
      status: input.status,
      book_value: input.bookValue
    })
    .select("id, asset_id")
    .single();
  if (error) throw error;
  return data as { id: string; asset_id: string };
}

export async function markNotificationRead(notificationId: string) {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null);
  if (error) throw error;
}
