import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";

const RELEASED = new Set(["resigned", "retired", "dismissed"]);

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  const updates: Record<string, string | number> = {};
  const fields: Record<string, string> = {
    fullName: "full_name",
    jobTitle: "job_title",
    phone: "phone",
    personalEmail: "personal_email",
    startDate: "start_date",
    status: "status",
    dateOfBirth: "date_of_birth",
    sex: "sex",
    homeAddress: "home_address",
    nextOfKinName: "next_of_kin_name",
    nextOfKinPhone: "next_of_kin_phone",
    governmentIdNumber: "government_id_number",
    bankAccount: "bank_account",
    departmentId: "department_id"
  };

  for (const [input, column] of Object.entries(fields)) {
    if (body[input] != null && String(body[input]).trim() !== "") updates[column] = String(body[input]).trim();
  }
  if (body.annualLeaveDays != null) {
    const days = Number(body.annualLeaveDays);
    if (!Number.isInteger(days) || days < 10 || days > 20) {
      return NextResponse.json({ error: "Annual leave days must be from 10 to 20" }, { status: 400 });
    }
    updates.annual_leave_days = days;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await caller.supabase
    .from("staff")
    .update(updates)
    .eq("id", context.params.id)
    .select("id, staff_number, status, full_name")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    staff: data,
    numberReleased: RELEASED.has(String(updates.status ?? data.status))
  });
}
