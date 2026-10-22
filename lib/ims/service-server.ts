import type { SupabaseClient } from "@supabase/supabase-js";
import type { Caller } from "@/lib/ims/require-user";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { leaveRequestError, leaveRules, workingDays, type LeaveCode } from "@/lib/ims/leave-rules";
import { generateRequestReference, type RequestQuestion } from "@/lib/ims/service";

export function admin() {
  return getSupabaseAdmin();
}

export async function resolveCallerScope(caller: Caller, db: SupabaseClient) {
  let subsidiaryId = caller.subsidiaryId;
  if (!subsidiaryId && caller.departmentId) {
    const { data } = await db.from("departments").select("subsidiary_id").eq("id", caller.departmentId).maybeSingle();
    subsidiaryId = data?.subsidiary_id ?? null;
  }
  return { departmentId: caller.departmentId, subsidiaryId };
}

export async function peopleAccessScope(caller: Caller, db: SupabaseClient) {
  if (caller.role === "manager" || caller.role === "department_head") {
    return {
      scope: "department" as const,
      departmentIds: caller.departmentId ? [caller.departmentId] : ([] as string[])
    };
  }
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId) {
      return { scope: "subsidiary" as const, departmentIds: [] as string[] };
    }
    const { data } = await db.from("departments").select("id").eq("subsidiary_id", subsidiaryId);
    return {
      scope: "subsidiary" as const,
      departmentIds: (data ?? []).map((row) => row.id as string)
    };
  }
  return { scope: "all" as const, departmentIds: null as string[] | null };
}

export async function findApproverId(db: SupabaseClient, caller: Caller, subsidiaryId: string | null) {
  const { data: staffRow } = await db
    .from("staff")
    .select("id, reports_to_staff_id")
    .eq("profile_id", caller.userId)
    .maybeSingle();

  if (staffRow?.reports_to_staff_id) {
    const { data: boss } = await db
      .from("staff")
      .select("profile_id")
      .eq("id", staffRow.reports_to_staff_id)
      .maybeSingle();
    if (boss?.profile_id && boss.profile_id !== caller.userId) return boss.profile_id as string;
  }

  if (caller.departmentId && !["manager", "department_head", "executive_director"].includes(caller.role)) {
    const { data: heads } = await db
      .from("profiles")
      .select("id")
      .eq("department_id", caller.departmentId)
      .eq("is_active", true)
      .in("role", ["manager", "department_head"]);
    const other = (heads ?? []).find((row) => row.id !== caller.userId);
    if (other?.id) return other.id as string;
  }

  if (subsidiaryId && caller.role !== "executive_director") {
    const { data: eds } = await db
      .from("profiles")
      .select("id")
      .eq("subsidiary_id", subsidiaryId)
      .eq("role", "executive_director")
      .eq("is_active", true);
    const ed = (eds ?? []).find((row) => row.id !== caller.userId);
    if (ed?.id) return ed.id as string;
  }

  const { data: doa } = await db
    .from("profiles")
    .select("id")
    .eq("role", "director_of_administration")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (doa?.id && doa.id !== caller.userId) return doa.id as string;

  const { data: gm } = await db
    .from("profiles")
    .select("id")
    .eq("role", "general_manager")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return gm?.id && gm.id !== caller.userId ? (gm.id as string) : null;
}

export async function findDepartmentByCode(db: SupabaseClient, code: string | null | undefined) {
  if (!code) return null;
  const { data } = await db.from("departments").select("id, code, name").eq("code", code).maybeSingle();
  return data ?? null;
}

export async function addEvent(
  db: SupabaseClient,
  requestId: string,
  actorId: string,
  fromStatus: string | null,
  toStatus: string,
  note?: string | null
) {
  await db.from("service_request_events").insert({
    request_id: requestId,
    actor_id: actorId,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null
  });
}

export function answersToTitle(categoryName: string, answers: Record<string, string>) {
  const leaveLabel = answers.leaveType && leaveRules[answers.leaveType as LeaveCode]?.label;
  const hint =
    leaveLabel || answers.item || answers.what || answers.system || answers.fault || answers.reason || answers.leaveType;
  const who =
    answers.forWhom === "staff" && answers.staffName
      ? ` · for ${answers.staffName}`
      : answers.forWhom === "self"
        ? " · self"
        : "";
  return hint ? `${categoryName}: ${String(hint).slice(0, 80)}${who}` : `${categoryName}${who}`;
}

export function validateAnswers(questions: RequestQuestion[], answers: Record<string, string>) {
  for (const question of questions) {
    if (question.required && !String(answers[question.key] ?? "").trim()) {
      throw new Error(`${question.label} is required`);
    }
  }
}

const STAFF_LINK_COLUMNS =
  "id, status, annual_leave_days, department_id, full_name, profile_id, personal_email, work_email, staff_number";

function namesMatch(left?: string | null, right?: string | null) {
  const a = String(left ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const b = String(right ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return Boolean(a && b && a === b);
}

function emailsMatch(left?: string | null, right?: string | null) {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

function allowedSex(value?: string | null) {
  const sex = String(value ?? "").trim();
  if (sex === "Female" || sex === "Male" || sex === "Other") return sex;
  return null;
}

export async function attachProfileToStaff(
  db: SupabaseClient,
  profileId: string,
  emails: Array<string | null | undefined>,
  fullName?: string | null,
  departmentId?: string | null
) {
  const wanted = emails.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  const { data: roster } = await db
    .from("staff")
    .select("id, personal_email, work_email, full_name, department_id, profile_id")
    .is("profile_id", null);
  const match =
    (roster ?? []).find((person) => wanted.some((email) => emailsMatch(person.personal_email, email) || emailsMatch(person.work_email, email))) ??
    (roster ?? []).find(
      (person) => namesMatch(person.full_name, fullName) && (!departmentId || person.department_id === departmentId)
    );
  if (!match) return;
  await db.from("staff").update({ profile_id: profileId }).eq("id", match.id);
}

export async function linkStaffToProfile(
  db: SupabaseClient,
  staffId: string,
  emails: Array<string | null | undefined>,
  fullName?: string | null
) {
  const wanted = emails.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  const { data } = await getSupabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user =
    (data.users ?? []).find((item) => wanted.includes(String(item.email ?? "").trim().toLowerCase())) ??
    (data.users ?? []).find((item) => namesMatch(item.user_metadata?.full_name, fullName));
  if (!user) return;
  await db.from("staff").update({ profile_id: user.id }).eq("id", staffId).is("profile_id", null);
}

export async function ensureStaffForCaller(db: SupabaseClient, caller: Caller) {
  const { data: linked } = await db.from("staff").select(STAFF_LINK_COLUMNS).eq("profile_id", caller.userId).maybeSingle();
  if (linked) return linked;

  const [{ data: auth }, { data: profile }] = await Promise.all([
    getSupabaseAdmin().auth.admin.getUserById(caller.userId),
    db.from("profiles").select("id, full_name, department_id").eq("id", caller.userId).maybeSingle()
  ]);
  const email = String(auth.user?.email ?? "").trim().toLowerCase();
  const fullName = String(profile?.full_name ?? "").trim();
  const departmentId = caller.departmentId || profile?.department_id || null;

  const { data: roster } = await db
    .from("staff")
    .select(STAFF_LINK_COLUMNS)
    .not("status", "in", "(resigned,retired,dismissed)");
  const match =
    (roster ?? []).find((person) => !person.profile_id && (emailsMatch(person.personal_email, email) || emailsMatch(person.work_email, email))) ??
    (roster ?? []).find((person) => emailsMatch(person.personal_email, email) || emailsMatch(person.work_email, email)) ??
    (roster ?? []).find(
      (person) =>
        !person.profile_id &&
        namesMatch(person.full_name, fullName) &&
        (!departmentId || person.department_id === departmentId)
    );

  if (match) {
    if (!match.profile_id) {
      await db.from("staff").update({ profile_id: caller.userId }).eq("id", match.id);
      match.profile_id = caller.userId;
    }
    return match;
  }

  const { data: applications } = await db
    .from("staff_applications")
    .select(
      "full_name, job_title, phone, personal_email, work_email, start_date, employment_status, date_of_birth, sex, home_address, next_of_kin_name, next_of_kin_phone, government_id_number, nin, bank_account, annual_leave_days, department_id"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const application = (applications ?? []).find(
    (row) =>
      emailsMatch(row.personal_email, email) ||
      emailsMatch(row.work_email, email) ||
      (namesMatch(row.full_name, fullName) && (!departmentId || row.department_id === departmentId))
  );

  let staffNumber: string | null = null;
  const staffDepartmentId = departmentId || application?.department_id || null;
  if (staffDepartmentId) {
    const numbered = await db.rpc("allocate_staff_number", { p_department_id: staffDepartmentId });
    staffNumber = numbered.data ?? null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const sex = allowedSex(application?.sex);
  const payload: Record<string, unknown> = {
    staff_number: staffNumber,
    department_id: staffDepartmentId,
    full_name: application?.full_name || fullName || "Staff",
    job_title:
      application?.job_title || caller.role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    phone: application?.phone || null,
    personal_email: application?.personal_email || email || null,
    work_email: application?.work_email || email || null,
    start_date: application?.start_date || today,
    status: application?.employment_status || "permanent",
    date_of_birth: application?.date_of_birth || null,
    home_address: application?.home_address || null,
    next_of_kin_name: application?.next_of_kin_name || null,
    next_of_kin_phone: application?.next_of_kin_phone || null,
    government_id_number: application?.government_id_number || application?.nin || null,
    nin: application?.nin || null,
    bank_account: application?.bank_account || null,
    profile_id: caller.userId,
    created_by: caller.userId,
    annual_leave_days: application?.annual_leave_days ?? 10
  };
  if (sex) payload.sex = sex;

  let created = await db.from("staff").insert(payload).select(STAFF_LINK_COLUMNS).single();
  if (created.error && (/null value/i.test(created.error.message) || /staff_sex_check/i.test(created.error.message))) {
    const fallback = { ...payload };
    if (sex === "Female" || sex === "Male") fallback.sex = sex;
    else delete fallback.sex;
    created = await db
      .from("staff")
      .insert({
        ...fallback,
        date_of_birth: fallback.date_of_birth || "1990-01-01",
        home_address: fallback.home_address || "Not recorded",
        next_of_kin_name: fallback.next_of_kin_name || "Not recorded",
        next_of_kin_phone: fallback.next_of_kin_phone || "pending",
        phone: fallback.phone || "pending",
        government_id_number: fallback.government_id_number || application?.nin || `pending-${caller.userId}`
      })
      .select(STAFF_LINK_COLUMNS)
      .single();
  }
  if (created.error || !created.data) {
    if (/staff_sex_check|null value/i.test(created.error?.message ?? "")) {
      throw new Error(
        "Run supabase/migrations/202610210002_staff_identity.sql in the Supabase SQL editor, then submit the leave again."
      );
    }
    throw new Error(created.error?.message || "Could not link a staff record to your login");
  }
  return created.data;
}

export async function resolveSubjectStaff(
  db: SupabaseClient,
  caller: Caller,
  answers: Record<string, string>
) {
  const forStaff = answers.forWhom === "staff" && Boolean(answers.staffId);
  if (forStaff) {
    if (!["manager", "department_head"].includes(caller.role)) {
      throw new Error("You can only raise requests for yourself");
    }
    const { data: person } = await db
      .from("staff")
      .select(STAFF_LINK_COLUMNS)
      .eq("id", answers.staffId)
      .maybeSingle();
    if (!person) throw new Error("That staff record was not found");
    if (caller.departmentId && person.department_id !== caller.departmentId) {
      throw new Error("You can only raise requests for staff in your department");
    }
    answers.staffName = person.full_name;
    return person;
  }

  const person = await ensureStaffForCaller(db, caller);
  answers.staffName = person.full_name;
  answers.forWhom = answers.forWhom || "self";
  return person;
}

export async function createLinkedLeave(
  db: SupabaseClient,
  caller: Caller,
  answers: Record<string, string>
) {
  const leaveType = answers.leaveType as LeaveCode;
  if (!leaveRules[leaveType] || !answers.startDate || !answers.endDate) {
    throw new Error("Leave type, start date, and end date are required");
  }

  const person = await resolveSubjectStaff(db, caller, answers);

  const days = workingDays(answers.startDate, answers.endDate);
  const year = String(answers.startDate).slice(0, 4);
  const { data: approved } = await db
    .from("leave_requests")
    .select("working_days")
    .eq("staff_id", person.id)
    .eq("leave_type", "annual")
    .eq("status", "approved")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);

  const annualDaysUsed = (approved ?? []).reduce((sum, row) => sum + Number(row.working_days ?? 0), 0);
  const rule = leaveRules[leaveType];
  const message = leaveRequestError({
    leaveType,
    staffStatus: person.status,
    workingDays: days,
    annualLeaveDays: person.annual_leave_days,
    annualDaysUsed,
    hasDocument: !rule.document || Boolean(answers.documentNote)
  });
  if (message) throw new Error(message);

  const { data, error } = await db
    .from("leave_requests")
    .insert({
      staff_id: person.id,
      leave_type: leaveType,
      start_date: answers.startDate,
      end_date: answers.endDate,
      working_days: days,
      pay_status: rule.pay,
      document_path: answers.documentNote ? String(answers.documentNote).trim() : null,
      requested_by: caller.userId
    })
    .select("id, status")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create leave record");
  return data as { id: string; status: string };
}

export { generateRequestReference };
