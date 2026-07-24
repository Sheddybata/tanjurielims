import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  marketingStatusToDb,
  priorityToDb,
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
};

export async function createDailyReport(input: ReportWriteInput) {
  const supabase = getSupabaseBrowser();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("daily_reports")
    .insert({
      display_code: input.displayCode,
      department_id: input.departmentId,
      submitted_by: input.submittedBy,
      parent_report_id: input.parentReportId ?? null,
      reporting_date: input.reportingDate,
      status: statusToDb[input.status],
      priority: priorityToDb[input.priority],
      revenue: input.revenue,
      inquiries: input.inquiries,
      attendance: input.attendance,
      active_operations: input.activeOperations,
      cash_in: input.cashIn,
      expenses: input.expenses,
      assets_flagged: input.assetsFlagged,
      jobs_completed: input.jobsCompleted || null,
      jobs_in_progress: input.jobsInProgress || null,
      department_update: input.departmentUpdate || null,
      current_projects: input.currentProjects || null,
      upcoming_projects: input.upcomingProjects || null,
      growth_ideas: input.growthIdeas || null,
      challenges: input.challenges || null,
      summary: input.summary,
      submitted_at: input.status === "Pending Chairman Review" ? now : null
    })
    .select("id, display_code")
    .single();

  if (error) throw error;

  const labels = (input.equipmentStatus ?? []).filter(Boolean);
  if (labels.length) {
    const { error: equipmentError } = await supabase.from("daily_report_equipment_status").insert(
      labels.map((label) => ({
        report_id: data.id,
        equipment_label: label
      }))
    );
    if (equipmentError) throw equipmentError;
  }

  return data as { id: string; display_code: string };
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
