import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin } from "@/lib/ims/service-server";
import { isMissingTableError, isSuiteDepartment } from "@/lib/ims/service";

async function suiteDepartment(db: ReturnType<typeof admin>, departmentId: string) {
  const { data } = await db
    .from("departments")
    .select("id, name, code, subsidiary_id, subsidiaries(code, name)")
    .eq("id", departmentId)
    .maybeSingle();
  return {
    department: data,
    allowed: isSuiteDepartment({ code: data?.code, name: data?.name })
  };
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const db = admin();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? caller.departmentId : request.nextUrl.searchParams.get("departmentId") || caller.departmentId;
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const { department, allowed } = await suiteDepartment(db, departmentId);
  if (!allowed) {
    return NextResponse.json({ error: "This login is not a Suite desk", suite: false, entries: [] });
  }

  const { data, error } = await db
    .from("suite_checkins")
    .select("*")
    .eq("department_id", departmentId)
    .order("check_in_date", { ascending: false })
    .limit(80);
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ suite: true, department, entries: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ suite: true, department, entries: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!["manager", "department_head", "executive_director", "director_of_administration", "general_manager", "chairman"].includes(caller.role)) {
    return NextResponse.json({ error: "Not allowed to record a check-in" }, { status: 403 });
  }
  const body = await request.json();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? String(caller.departmentId || "") : String(body.departmentId || caller.departmentId || "");
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const { allowed } = await suiteDepartment(admin(), departmentId);
  if (!allowed) return NextResponse.json({ error: "This login is not a Suite desk" }, { status: 400 });

  const guestName = String(body.guestName ?? "").trim();
  const suiteName = String(body.suiteName ?? "").trim();
  if (!guestName) return NextResponse.json({ error: "Guest name is required" }, { status: 400 });
  if (!suiteName) return NextResponse.json({ error: "Suite is required" }, { status: 400 });

  const { data, error } = await admin()
    .from("suite_checkins")
    .insert({
      department_id: departmentId,
      guest_name: guestName,
      suite_name: suiteName,
      check_in_date: body.checkInDate || new Date().toISOString().slice(0, 10),
      check_out_date: body.checkOutDate || null,
      amount_paid: Number(body.amountPaid ?? 0),
      payment_method: body.paymentMethod ? String(body.paymentMethod).trim() : null,
      note: body.note ? String(body.note).trim() : null,
      entered_by: caller.userId
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data });
}
