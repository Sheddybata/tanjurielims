import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";

const KPI_SELECT = `
  id,
  measure,
  target_value,
  unit,
  period_start,
  period_end,
  actual_value,
  actual_note,
  subsidiary_id,
  department_id,
  subsidiaries(id, name),
  departments(id, name)
`;

const resultRoles = new Set(["executive_director", "manager", "department_head", "director_of_administration"]);

function databaseMessage(message: string) {
  if (message.includes("directorate_kpis") || message.includes("schema cache")) {
    return "Directorate targets are not in the database yet. Run supabase/migrations/202610010005_directorate_kpis.sql in the Supabase SQL editor, then refresh.";
  }
  return message;
}

function asNumber(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const { data, error } = await caller.supabase
    .from("directorate_kpis")
    .select(KPI_SELECT)
    .order("period_start", { ascending: false });

  if (error) return NextResponse.json({ error: databaseMessage(error.message) }, { status: 400 });
  return NextResponse.json({ kpis: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (caller.role !== "director_of_administration") {
    return NextResponse.json({ error: "Only the Director of Administration can set a target" }, { status: 403 });
  }

  const body = await request.json();
  const measure = String(body.measure ?? "").trim();
  const targetValue = asNumber(body.targetValue);
  const periodStart = String(body.periodStart ?? "");
  const periodEnd = String(body.periodEnd ?? "");
  const subsidiaryId = String(body.subsidiaryId ?? "");
  const departmentId = String(body.departmentId ?? "").trim();
  if (!measure || targetValue == null || !periodStart || !periodEnd || !subsidiaryId) {
    return NextResponse.json({ error: "Subsidiary, what is measured, the target, and the period are required" }, { status: 400 });
  }
  if (periodEnd < periodStart) {
    return NextResponse.json({ error: "The period end must be on or after the start" }, { status: 400 });
  }

  if (departmentId) {
    const { data: department, error: departmentError } = await caller.supabase
      .from("departments")
      .select("id, subsidiary_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (departmentError || !department) return NextResponse.json({ error: "Department was not found" }, { status: 400 });
    if (department.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "That department does not sit inside the selected subsidiary" }, { status: 400 });
    }
  }

  const { data, error } = await caller.supabase
    .from("directorate_kpis")
    .insert({
      subsidiary_id: subsidiaryId,
      department_id: departmentId || null,
      measure,
      target_value: targetValue,
      unit: String(body.unit ?? "").trim(),
      period_start: periodStart,
      period_end: periodEnd,
      set_by: caller.userId
    })
    .select(KPI_SELECT)
    .single();

  if (error) return NextResponse.json({ error: databaseMessage(error.message) }, { status: 400 });
  return NextResponse.json({ kpi: data });
}

export async function PATCH(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!resultRoles.has(caller.role)) {
    return NextResponse.json({ error: "You cannot enter a result for this target" }, { status: 403 });
  }

  const body = await request.json();
  const id = String(body.id ?? "");
  const actualValue = asNumber(body.actualValue);
  if (!id || actualValue == null) {
    return NextResponse.json({ error: "The target and the result are required" }, { status: 400 });
  }

  const { data: current, error: currentError } = await caller.supabase
    .from("directorate_kpis")
    .select("id, subsidiary_id, department_id")
    .eq("id", id)
    .maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: "Target was not found" }, { status: 404 });

  if (caller.role === "manager" || caller.role === "department_head") {
    if (current.department_id && current.department_id !== caller.departmentId) {
      return NextResponse.json({ error: "This result belongs to another department" }, { status: 403 });
    }
  }

  const { data, error } = await caller.supabase
    .from("directorate_kpis")
    .update({
      actual_value: actualValue,
      actual_note: String(body.actualNote ?? "").trim() || null,
      result_by: caller.userId
    })
    .eq("id", id)
    .select(KPI_SELECT)
    .single();

  if (error) return NextResponse.json({ error: databaseMessage(error.message) }, { status: 400 });
  return NextResponse.json({ kpi: data });
}
