import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin } from "@/lib/ims/service-server";
import { priorityToDb, statusToDb, type UiPriority, type UiSubmissionStatus } from "@/lib/ims/mappers";

const WRITE_ROLES = new Set(["manager", "department_head"]);

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITE_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Only a manager or unit head can file a daily report" }, { status: 403 });
  }
  if (!caller.departmentId) {
    return NextResponse.json(
      { error: "Your login is not linked to a department. Ask the Chairman or General Manager to assign Construction." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const status = body.status as UiSubmissionStatus;
  if (status !== "Draft" && status !== "Pending Chairman Review") {
    return NextResponse.json({ error: "A report can be saved as a draft or sent to the Executive Director." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    display_code: String(body.displayCode || "").trim() || `IMS-${now.slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-6)}`,
    department_id: caller.departmentId,
    submitted_by: caller.userId,
    parent_report_id: body.parentReportId || null,
    reporting_date: body.reportingDate || now.slice(0, 10),
    status: statusToDb[status],
    priority: priorityToDb[(body.priority as UiPriority) || "Normal"],
    revenue: Number(body.revenue ?? 0) || 0,
    inquiries: Number(body.inquiries ?? 0) || 0,
    attendance: Number(body.attendance ?? 0) || 0,
    active_operations: Number(body.activeOperations ?? 0) || 0,
    cash_in: Number(body.cashIn ?? 0) || 0,
    expenses: Number(body.expenses ?? 0) || 0,
    assets_flagged: Number(body.assetsFlagged ?? 0) || 0,
    jobs_completed: body.jobsCompleted || null,
    jobs_in_progress: body.jobsInProgress || null,
    department_update: body.departmentUpdate || null,
    current_projects: body.currentProjects || null,
    upcoming_projects: body.upcomingProjects || null,
    growth_ideas: body.growthIdeas || null,
    challenges: body.challenges || null,
    summary: body.summary || "No narrative summary supplied.",
    funds_destination: body.fundsDestination || null,
    submitted_at: status === "Pending Chairman Review" ? now : null
  };

  const db = admin();
  let { data, error } = await db.from("daily_reports").insert(payload).select("id, display_code").single();
  if (error && /funds_destination/.test(error.message)) {
    const { funds_destination: _ignored, ...withoutFunds } = payload;
    const retry = await db.from("daily_reports").insert(withoutFunds).select("id, display_code").single();
    data = retry.data;
    error = retry.error;
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to save report" }, { status: 400 });
  }

  const labels = (Array.isArray(body.equipmentStatus) ? body.equipmentStatus : []).map(String).filter(Boolean);
  if (labels.length) {
    const { error: equipmentError } = await db.from("daily_report_equipment_status").insert(
      labels.map((label: string) => ({
        report_id: data.id,
        equipment_label: label
      }))
    );
    if (equipmentError) {
      return NextResponse.json({ error: equipmentError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ report: data });
}
