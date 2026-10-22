import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, peopleAccessScope } from "@/lib/ims/service-server";
import { describePeople, findSharedGovernmentIds, peopleSharingId } from "@/lib/ims/identity";
import { getSupabaseAdmin } from "@/lib/supabase/client";

const PEOPLE_READ = new Set([
  "chairman",
  "managing_director",
  "executive_director",
  "general_manager",
  "director_of_administration",
  "human_resources"
]);

const PEOPLE_WRITE = new Set(["director_of_administration", "human_resources"]);

const STAFF_COLUMNS = `
  id,
  staff_number,
  full_name,
  preferred_name,
  job_title,
  phone,
  personal_email,
  work_email,
  start_date,
  status,
  date_of_birth,
  sex,
  nationality,
  home_address,
  next_of_kin_name,
  next_of_kin_phone,
  government_id_type,
  government_id_number,
  nin,
  bvn,
  bank_name,
  bank_account,
  annual_leave_days,
  photograph_path,
  department_id,
  created_at,
  updated_at
`;

const CORE_COLUMNS = `
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
  department_id,
  created_at,
  updated_at
`;

async function selectAll(db: ReturnType<typeof admin>, columns: string, departmentIds?: string[] | null) {
  if (departmentIds && departmentIds.length === 0) return { error: null, data: [] as any[] };
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = db.from("staff").select(columns).order("full_name").range(from, from + pageSize - 1);
    if (departmentIds) query = query.in("department_id", departmentIds);
    const { data, error } = await query;
    if (error) return { error, data: null as any[] | null };
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return { error: null, data: rows };
  }
}

function normalizeDepartment(row: any) {
  const department = Array.isArray(row.departments) ? row.departments[0] : row.departments;
  return { ...row, departments: department ?? null };
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const db = PEOPLE_READ.has(caller.role) ? admin() : caller.supabase;
  const access = await peopleAccessScope(caller, db);
  const attempts = [
    `${STAFF_COLUMNS}, departments(id, name, code, subsidiaries(name))`,
    `${STAFF_COLUMNS}, departments(id, name, code)`,
    `${CORE_COLUMNS}, departments(id, name, code)`,
    CORE_COLUMNS
  ];

  let result: { error: { message: string } | null; data: any[] | null } = { error: { message: "Failed to load staff" }, data: null };
  for (const columns of attempts) {
    result = await selectAll(db, columns, access.departmentIds);
    if (!result.error) break;
  }
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error?.message || "Failed to load staff" }, { status: 400 });
  }

  const storage = getSupabaseAdmin();
  const staff = await Promise.all(
    result.data.map(async (row: any) => {
      const next = normalizeDepartment(row);
      let photoUrl: string | null = null;
      if (next.photograph_path) {
        const { data: signed } = await storage.storage.from("staff-applications").createSignedUrl(next.photograph_path, 60 * 30);
        photoUrl = signed?.signedUrl ?? null;
      }
      return { ...next, photoUrl };
    })
  );

  return NextResponse.json({
    staff,
    scope: access.scope,
    sharedIds: findSharedGovernmentIds(staff)
  });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!PEOPLE_WRITE.has(caller.role)) {
    return NextResponse.json({ error: "Only HR or Director of Administration can add staff" }, { status: 403 });
  }

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
    "nextOfKinPhone"
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

  const governmentIdNumber = body.governmentIdNumber ? String(body.governmentIdNumber).trim() : null;
  const nin = body.nin ? String(body.nin).trim() : null;

  const db = admin();
  const { data: existing } = await db
    .from("staff")
    .select("id, staff_number, full_name, government_id_number, nin, status")
    .not("status", "in", "(resigned,retired,dismissed)");
  const matches = peopleSharingId(existing ?? [], {
    id: "new",
    full_name: String(body.fullName).trim(),
    staff_number: "new record",
    government_id_number: governmentIdNumber,
    nin
  });
  const clash = findSharedGovernmentIds([
    ...(existing ?? []),
    {
      id: "new",
      full_name: String(body.fullName).trim(),
      staff_number: "new record",
      government_id_number: governmentIdNumber,
      nin
    }
  ]);

  const { data: staffNumber, error: numberError } = await db.rpc("allocate_staff_number", {
    p_department_id: body.departmentId
  });
  if (numberError || !staffNumber) {
    return NextResponse.json({ error: numberError?.message || "Could not issue a staff number" }, { status: 400 });
  }

  const payload = {
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
    government_id_number: governmentIdNumber || nin,
    nin: nin || governmentIdNumber,
    bank_account: body.bankAccount ? String(body.bankAccount).trim() : null,
    annual_leave_days: annualLeaveDays,
    created_by: caller.userId
  };

  let { data, error } = await db.from("staff").insert(payload).select(`${STAFF_COLUMNS}, departments(id, name, code)`).single();
  if (error && /null value/i.test(error.message)) {
    const retry = await db
      .from("staff")
      .insert({
        ...payload,
        government_id_number: governmentIdNumber || nin || `pending-${crypto.randomUUID()}`,
        bank_account: payload.bank_account || `pending-${crypto.randomUUID()}`
      })
      .select(`${STAFF_COLUMNS}, departments(id, name, code)`)
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const named = matches.length ? ` This government-issued ID is already used by ${describePeople(matches)}.` : "";
    return NextResponse.json({ error: `${error.message}.${named}`.trim() }, { status: 400 });
  }
  return NextResponse.json({
    staff: data,
    sharedIds: clash,
    warning: matches.length ? `This government-issued ID is already used by ${describePeople(matches)}.` : null
  });
}
