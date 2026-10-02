import { getSupabaseBrowser } from "@/lib/supabase/client";
import {
  marketingStatusFromDb,
  priorityFromDb,
  roleFromDb,
  statusFromDb,
  type DbMarketingStatus,
  type DbReportPriority,
  type DbReportStatus,
  type DbRole,
  type UiRole
} from "@/lib/ims/mappers";

export type ProfileRow = {
  id: string;
  full_name: string;
  role: DbRole;
  department_id: string | null;
  is_active: boolean;
  departments?: { id: string; name: string } | null;
};

export type DepartmentRow = {
  id: string;
  name: string;
  code?: string | null;
  subsidiaryId?: string | null;
  subsidiaryName?: string | null;
  subsidiaryCode?: string | null;
};

function mapDepartment(row: any): DepartmentRow {
  const subsidiary = Array.isArray(row.subsidiaries) ? row.subsidiaries[0] : row.subsidiaries;
  return {
    id: row.id as string,
    name: row.name as string,
    code: row.code ?? null,
    subsidiaryId: row.subsidiary_id ?? subsidiary?.id ?? null,
    subsidiaryName: subsidiary?.name ?? null,
    subsidiaryCode: subsidiary?.code ?? null
  };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSessionUser() {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, department_id, is_active, departments(id, name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function fetchDepartments(): Promise<DepartmentRow[]> {
  const supabase = getSupabaseBrowser();
  const rich = await supabase
    .from("departments")
    .select("id, name, code, subsidiary_id, subsidiaries(id, name, code, sort_order)")
    .order("name");
  if (!rich.error) return (rich.data ?? []).map(mapDepartment);

  const { data, error } = await supabase.from("departments").select("id, name").order("name");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

export function profileToSession(profile: ProfileRow) {
  const role = roleFromDb[profile.role] as UiRole;
  return {
    role,
    name: profile.full_name,
    department: profile.departments?.name as string | undefined,
    userId: profile.id,
    departmentId: profile.department_id
  };
}

function subsidiaryName(value: any) {
  const nested = Array.isArray(value) ? value[0] : value;
  return nested?.name as string | undefined;
}

export async function fetchDailyReports() {
  const supabase = getSupabaseBrowser();
  const columns = `
      id,
      display_code,
      reporting_date,
      status,
      priority,
      revenue,
      inquiries,
      attendance,
      active_operations,
      cash_in,
      expenses,
      assets_flagged,
      jobs_completed,
      jobs_in_progress,
      department_update,
      current_projects,
      upcoming_projects,
      growth_ideas,
      challenges,
      summary,
      submitted_by,
      department_id,
      submitter:profiles!daily_reports_submitted_by_fkey(full_name),
      daily_report_equipment_status(equipment_label)
    `;
  const rich = await supabase
    .from("daily_reports")
    .select(`${columns}, departments(name, subsidiaries(name))`)
    .order("created_at", { ascending: false });
  const plain = rich.error
    ? await supabase
        .from("daily_reports")
        .select(`${columns}, departments(name)`)
        .order("created_at", { ascending: false })
    : null;
  const result = plain ?? rich;
  if (result.error) throw result.error;
  const data = result.data ?? [];
  return data.map((row: any) => ({
    id: row.display_code || row.id,
    dbId: row.id as string,
    department: row.departments?.name as string,
    departmentId: row.department_id as string | undefined,
    subsidiary: subsidiaryName(row.departments?.subsidiaries),
    submittedBy: row.submitter?.full_name ?? "Unknown",
    date: row.reporting_date as string,
    revenue: Number(row.revenue ?? 0),
    activeOperations: Number(row.active_operations ?? 0),
    cashIn: Number(row.cash_in ?? 0),
    expenses: Number(row.expenses ?? 0),
    assetsFlagged: Number(row.assets_flagged ?? 0),
    inquiries: row.inquiries != null ? Number(row.inquiries) : undefined,
    attendance: row.attendance != null ? Number(row.attendance) : undefined,
    jobsCompleted: row.jobs_completed ?? undefined,
    jobsInProgress: row.jobs_in_progress ?? undefined,
    equipmentStatus: (row.daily_report_equipment_status ?? []).map((item: any) => item.equipment_label as string),
    departmentUpdate: row.department_update ?? undefined,
    currentProjects: row.current_projects ?? undefined,
    upcomingProjects: row.upcoming_projects ?? undefined,
    growthIdeas: row.growth_ideas ?? undefined,
    challenges: row.challenges ?? undefined,
    summary: row.summary ?? "",
    status: statusFromDb[row.status as DbReportStatus],
    priority: priorityFromDb[row.priority as DbReportPriority]
  }));
}

export async function fetchApprovalActions() {
  const supabase = getSupabaseBrowser();
  const columns = `
      id,
      report_id,
      previous_status,
      new_status,
      comment,
      created_at,
      actor:profiles!approval_actions_actor_id_fkey(full_name)
    `;
  const rich = await supabase
    .from("approval_actions")
    .select(`${columns}, daily_reports(display_code, departments(name, subsidiaries(name)))`)
    .order("created_at", { ascending: false });
  const plain = rich.error
    ? await supabase
        .from("approval_actions")
        .select(`${columns}, daily_reports(display_code, departments(name))`)
        .order("created_at", { ascending: false })
    : null;
  const result = plain ?? rich;
  if (result.error) throw result.error;
  return (result.data ?? []).map((row: any) => ({
    id: row.id as string,
    reportId: (row.daily_reports?.display_code || row.report_id) as string,
    dbReportId: row.report_id as string,
    department: row.daily_reports?.departments?.name as string,
    subsidiary: subsidiaryName(row.daily_reports?.departments?.subsidiaries),
    actor: row.actor?.full_name ?? "Executive",
    action: statusFromDb[row.new_status as DbReportStatus] as "Pending Chairman Review" | "Approved" | "Returned",
    previousStatus: statusFromDb[row.previous_status as DbReportStatus],
    comment: row.comment ?? "",
    createdAt: row.created_at as string
  }));
}

export async function fetchNotifications() {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, report_id, title, message, created_at, read_at, daily_reports(display_code, departments(name))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    reportId: (row.daily_reports?.display_code || row.report_id || "") as string,
    department: (row.daily_reports?.departments?.name || "") as string,
    title: row.title as string,
    message: row.message as string,
    createdAt: row.created_at as string,
    read: Boolean(row.read_at)
  }));
}

export async function fetchLeads() {
  const supabase = getSupabaseBrowser();
  const columns = "id, client, visit_date, proposal, quotation, status";
  const rich = await supabase
    .from("marketing_leads")
    .select(`${columns}, departments:assigned_department_id(name, subsidiaries(name))`)
    .order("created_at", { ascending: false });
  const plain = rich.error
    ? await supabase
        .from("marketing_leads")
        .select(`${columns}, departments:assigned_department_id(name)`)
        .order("created_at", { ascending: false })
    : null;
  const result = plain ?? rich;
  if (result.error) throw result.error;
  return (result.data ?? []).map((row: any) => ({
    id: row.id as string,
    client: row.client as string,
    visitDate: row.visit_date as string,
    proposal: row.proposal as string,
    quotation: Number(row.quotation ?? 0),
    assignedDepartment: [subsidiaryName(row.departments?.subsidiaries), row.departments?.name].filter(Boolean).join(" · "),
    status: marketingStatusFromDb[row.status as DbMarketingStatus]
  }));
}

export async function fetchAssets() {
  const supabase = getSupabaseBrowser();
  const columns =
    "asset_id, name, classification, purchase_date, supplier_name, serial_number, custodian_name, warranty_expiration, maintenance_schedule_interval, location, status, book_value";
  const rich = await supabase
    .from("assets")
    .select(`${columns}, departments(name, subsidiaries(name))`)
    .order("created_at", { ascending: false });
  const plain = rich.error
    ? await supabase.from("assets").select(`${columns}, departments(name)`).order("created_at", { ascending: false })
    : null;
  const result = plain ?? rich;
  if (result.error) throw result.error;
  const data = result.data;
  return (data ?? []).map((row: any) => ({
    asset_id: row.asset_id as string,
    name: row.name as string,
    classification: row.classification as string,
    purchase_date: row.purchase_date ?? "",
    supplier_name: row.supplier_name ?? "",
    serial_number: row.serial_number ?? "",
    department_id: [subsidiaryName(row.departments?.subsidiaries), row.departments?.name].filter(Boolean).join(" · "),
    custodian_name: row.custodian_name as string,
    warranty_expiration: row.warranty_expiration ?? "N/A",
    maintenance_schedule_interval: row.maintenance_schedule_interval ?? "",
    location: row.location ?? "",
    status: row.status,
    book_value: Number(row.book_value ?? 0)
  }));
}

export async function fetchProfiles() {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, departments(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
