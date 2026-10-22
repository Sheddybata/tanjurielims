import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, peopleAccessScope } from "@/lib/ims/service-server";
import { isMissingTableError } from "@/lib/ims/service";

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const db = admin();

  const [{ data: waiting, error: waitingError }, { data: mine, error: mineError }, { data: notices }] = await Promise.all([
    db
      .from("service_requests")
      .select("id, reference_code, title, status, created_at, request_categories(name)")
      .eq("waiting_on_id", caller.userId)
      .in("status", ["submitted", "under_review", "needs_information", "approved", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("service_requests")
      .select("id, status")
      .eq("requester_id", caller.userId)
      .in("status", ["draft", "submitted", "under_review", "needs_information", "approved", "in_progress"]),
    db
      .from("announcements")
      .select("id, title, body, audience, is_pinned, created_at")
      .eq("is_published", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  const desk: Array<{
    id: string;
    title: string;
    subtitle: string;
    status: string;
    page: "Requests" | "Department Reports" | "Leave";
  }> = [];

  if (caller.role === "executive_director") {
    const access = await peopleAccessScope(caller, db);
    const departmentIds = access.departmentIds ?? [];
    if (departmentIds.length) {
      const [{ data: reports }, { data: staffRows }] = await Promise.all([
        db
          .from("daily_reports")
          .select("id, display_code, reporting_date, departments(name)")
          .eq("status", "pending_chairman_review")
          .in("department_id", departmentIds)
          .order("reporting_date", { ascending: false })
          .limit(12),
        db.from("staff").select("id").in("department_id", departmentIds)
      ]);
      for (const report of reports ?? []) {
        const department = Array.isArray(report.departments) ? report.departments[0] : report.departments;
        desk.push({
          id: `report:${report.id}`,
          title: `${department?.name ?? "Department"} daily report`,
          subtitle: `${report.display_code ?? "Report"} · ${report.reporting_date}`,
          status: "Pending Executive Director",
          page: "Department Reports"
        });
      }
      const staffIds = (staffRows ?? []).map((row) => row.id as string);
      if (staffIds.length) {
        const { data: leaveRows } = await db
          .from("leave_requests")
          .select("id, leave_type, start_date, end_date, staff(full_name)")
          .eq("status", "pending_executive_director")
          .in("staff_id", staffIds)
          .order("created_at", { ascending: false })
          .limit(12);
        for (const row of leaveRows ?? []) {
          const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
          desk.push({
            id: `leave:${row.id}`,
            title: `${staff?.full_name ?? "Staff"} leave`,
            subtitle: `${row.leave_type} · ${row.start_date} to ${row.end_date}`,
            status: "Waiting on you",
            page: "Leave"
          });
        }
      }
    }
  }

  for (const item of waiting ?? []) {
    const category = Array.isArray(item.request_categories) ? item.request_categories[0] : item.request_categories;
    desk.push({
      id: item.id,
      title: item.title,
      subtitle: `${item.reference_code} · ${category?.name ?? "Request"}`,
      status: item.status,
      page: "Requests"
    });
  }

  return NextResponse.json({
    waiting: waiting ?? [],
    desk,
    waitingCount: desk.length,
    openMine: (mine ?? []).length,
    announcements: notices ?? [],
    needsMigration: isMissingTableError(waitingError) || isMissingTableError(mineError)
  });
}
