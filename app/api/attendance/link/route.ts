import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, resolveCallerScope } from "@/lib/ims/service-server";
import { isConstructionDepartment, isMissingTableError } from "@/lib/ims/service";

const WRITE_ROLES = new Set(["manager", "department_head", "executive_director", "director_of_administration", "general_manager", "chairman"]);

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITE_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Not allowed to link attendance" }, { status: 403 });
  }

  const body = await request.json();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? String(caller.departmentId || "") : String(body.departmentId || caller.departmentId || "");
  const devicePin = String(body.devicePin ?? "").trim();
  const staffId = String(body.staffId ?? "").trim();
  if (!departmentId || !devicePin || !staffId) {
    return NextResponse.json({ error: "departmentId, devicePin, and staffId are required" }, { status: 400 });
  }

  const db = admin();
  const { data: department } = await db
    .from("departments")
    .select("id, name, code, subsidiary_id")
    .eq("id", departmentId)
    .maybeSingle();
  if (!isConstructionDepartment({ code: department?.code, name: department?.name })) {
    return NextResponse.json({ error: "Attendance is only for Construction" }, { status: 400 });
  }
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (subsidiaryId && department?.subsidiary_id && department.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only link attendance in your subsidiary" }, { status: 403 });
    }
  }

  const { data: person } = await db
    .from("staff")
    .select("id, full_name, department_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!person || person.department_id !== departmentId) {
    return NextResponse.json({ error: "That person is not on the Construction register" }, { status: 400 });
  }

  const { error: punchError } = await db
    .from("attendance_punches")
    .update({ staff_id: staffId })
    .eq("department_id", departmentId)
    .eq("device_pin", devicePin);
  if (punchError) return NextResponse.json({ error: punchError.message }, { status: 400 });

  const mapped = await db.from("attendance_pin_map").upsert(
    { department_id: departmentId, device_pin: devicePin, staff_id: staffId },
    { onConflict: "department_id,device_pin" }
  );
  if (mapped.error && !isMissingTableError(mapped.error)) {
    return NextResponse.json({ error: mapped.error.message }, { status: 400 });
  }

  return NextResponse.json({ devicePin, staffId, name: person.full_name });
}
