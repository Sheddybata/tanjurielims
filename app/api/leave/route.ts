import { NextRequest, NextResponse } from "next/server";
import { leaveRequestError, leaveRules, workingDays, type LeaveCode } from "@/lib/ims/leave-rules";
import { isCaller, requireCaller } from "@/lib/ims/require-user";

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const { data, error } = await caller.supabase
    .from("leave_requests")
    .select("id, leave_type, start_date, end_date, working_days, pay_status, status, decision_note, created_at, staff(id, full_name, staff_number, status, annual_leave_days, departments(name))")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  const leaveType = body.leaveType as LeaveCode;
  if (!body.staffId || !leaveRules[leaveType] || !body.startDate || !body.endDate) {
    return NextResponse.json({ error: "staffId, leaveType, startDate, and endDate are required" }, { status: 400 });
  }

  const days = workingDays(body.startDate, body.endDate);
  const { data: person, error: personError } = await caller.supabase
    .from("staff")
    .select("id, status, annual_leave_days")
    .eq("id", body.staffId)
    .maybeSingle();
  if (personError || !person) return NextResponse.json({ error: "Staff record was not found" }, { status: 404 });

  const year = String(body.startDate).slice(0, 4);
  const { data: approved, error: approvedError } = await caller.supabase
    .from("leave_requests")
    .select("working_days")
    .eq("staff_id", person.id)
    .eq("leave_type", "annual")
    .eq("status", "approved")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);
  if (approvedError) return NextResponse.json({ error: approvedError.message }, { status: 400 });

  const annualDaysUsed = (approved ?? []).reduce((sum, row) => sum + Number(row.working_days ?? 0), 0);
  const rule = leaveRules[leaveType];
  const message = leaveRequestError({
    leaveType,
    staffStatus: person.status,
    workingDays: days,
    annualLeaveDays: person.annual_leave_days,
    annualDaysUsed,
    hasDocument: !rule.document || Boolean(body.documentNote || body.documentPath)
  });
  if (message) return NextResponse.json({ error: message }, { status: 400 });

  const { data, error } = await caller.supabase
    .from("leave_requests")
    .insert({
      staff_id: person.id,
      leave_type: leaveType,
      start_date: body.startDate,
      end_date: body.endDate,
      working_days: days,
      pay_status: rule.pay,
      document_path: body.documentNote ? String(body.documentNote).trim() : null,
      requested_by: caller.userId
    })
    .select("id, leave_type, status, working_days, pay_status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ request: data });
}

export async function PATCH(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  const decision = body.decision as "approve" | "refuse";
  if (!body.requestId || (decision !== "approve" && decision !== "refuse")) {
    return NextResponse.json({ error: "requestId and decision are required" }, { status: 400 });
  }

  const { data: current, error: currentError } = await caller.supabase
    .from("leave_requests")
    .select("id, status")
    .eq("id", body.requestId)
    .maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: "Leave request was not found" }, { status: 404 });

  let nextStatus = current.status;
  const patch: Record<string, string> = {};
  if (caller.role === "executive_director" && current.status === "pending_executive_director") {
    nextStatus = decision === "approve" ? "pending_director_of_administration" : "refused";
    patch.executive_director_id = caller.userId;
  } else if (caller.role === "director_of_administration" && current.status === "pending_director_of_administration") {
    nextStatus = decision === "approve" ? "approved" : "refused";
    patch.director_of_administration_id = caller.userId;
  } else {
    return NextResponse.json({ error: "This leave request is not waiting for your approval" }, { status: 403 });
  }

  const { data, error } = await caller.supabase
    .from("leave_requests")
    .update({
      status: nextStatus,
      decision_note: body.note ? String(body.note).trim() : null,
      ...patch
    })
    .eq("id", current.id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ request: data });
}
