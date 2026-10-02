import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";

const STAFF_COLUMNS = `
  id,
  staff_number,
  full_name,
  job_title,
  phone,
  personal_email,
  start_date,
  status,
  date_of_birth,
  sex,
  home_address,
  next_of_kin_name,
  next_of_kin_phone,
  government_id_number,
  bank_account,
  annual_leave_days,
  photograph_path,
  created_at,
  updated_at
`;

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const rich = await caller.supabase
    .from("staff")
    .select(`${STAFF_COLUMNS}, departments(id, name, code, subsidiaries(name))`)
    .order("created_at", { ascending: false });
  const plain = rich.error
    ? await caller.supabase
        .from("staff")
        .select(`${STAFF_COLUMNS}, departments(id, name, code)`)
        .order("created_at", { ascending: false })
    : null;
  const result = plain ?? rich;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const data = result.data;
  return NextResponse.json({ staff: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  const required = [
    "departmentId",
    "fullName",
    "jobTitle",
    "phone",
    "personalEmail",
    "startDate",
    "status",
    "dateOfBirth",
    "sex",
    "homeAddress",
    "nextOfKinName",
    "nextOfKinPhone",
    "governmentIdNumber",
    "bankAccount"
  ] as const;
  for (const key of required) {
    if (!body[key] || String(body[key]).trim() === "") {
      return NextResponse.json({ error: `${key} is required` }, { status: 400 });
    }
  }

  const annualLeaveDays = Number(body.annualLeaveDays ?? 10);
  if (!Number.isInteger(annualLeaveDays) || annualLeaveDays < 10 || annualLeaveDays > 20) {
    return NextResponse.json({ error: "Annual leave days must be from 10 to 20" }, { status: 400 });
  }

  const { data: staffNumber, error: numberError } = await caller.supabase.rpc("allocate_staff_number", {
    p_department_id: body.departmentId
  });
  if (numberError || !staffNumber) {
    return NextResponse.json({ error: numberError?.message || "Could not issue a staff number" }, { status: 400 });
  }

  const { data, error } = await caller.supabase
    .from("staff")
    .insert({
      staff_number: staffNumber,
      department_id: body.departmentId,
      full_name: String(body.fullName).trim(),
      job_title: String(body.jobTitle).trim(),
      phone: String(body.phone).trim(),
      personal_email: String(body.personalEmail).trim(),
      start_date: body.startDate,
      status: body.status,
      date_of_birth: body.dateOfBirth,
      sex: body.sex,
      home_address: String(body.homeAddress).trim(),
      next_of_kin_name: String(body.nextOfKinName).trim(),
      next_of_kin_phone: String(body.nextOfKinPhone).trim(),
      government_id_number: String(body.governmentIdNumber).trim(),
      bank_account: String(body.bankAccount).trim(),
      annual_leave_days: annualLeaveDays,
      created_by: caller.userId
    })
    .select(`${STAFF_COLUMNS}, departments(id, name, code)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ staff: data });
}
