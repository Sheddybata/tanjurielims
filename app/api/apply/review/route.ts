import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { getSupabaseAdmin } from "@/lib/supabase/client";

const REVIEWER_ROLES = new Set(["director_of_administration", "human_resources"]);
const READER_ROLES = new Set([
  "chairman",
  "managing_director",
  "director_of_administration",
  "human_resources",
  "general_manager"
]);

const APPLICATION_COLUMNS = `
  id,
  reference_code,
  status,
  staff_type,
  employment_type,
  employment_status,
  full_name,
  preferred_name,
  sex,
  date_of_birth,
  nationality,
  phone,
  personal_email,
  work_email,
  home_address,
  next_of_kin_name,
  next_of_kin_phone,
  subsidiary_id,
  department_id,
  job_title,
  proposed_ims_role,
  reports_to_name,
  work_location,
  start_date,
  government_id_type,
  government_id_number,
  nin,
  bvn,
  bank_name,
  bank_account,
  highest_qualification,
  blood_group,
  biometric_consent,
  biometric_method,
  biometric_ready,
  biometric_note,
  annual_leave_days,
  photograph_path,
  id_document_path,
  cv_path,
  review_note,
  reviewed_by,
  reviewed_at,
  staff_id,
  created_at,
  updated_at
`;

async function signedPath(
  admin: ReturnType<typeof getSupabaseAdmin>,
  path: string | null | undefined
) {
  if (!path) return null;
  const { data } = await admin.storage.from("staff-applications").createSignedUrl(path, 60 * 30);
  return data?.signedUrl ?? null;
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!READER_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Not allowed to view staff applications" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  let query = caller.supabase
    .from("staff_applications")
    .select(`${APPLICATION_COLUMNS}, departments(id, name, code, subsidiaries(name)), staff:staff_id(id, staff_number)`)
    .order("created_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = getSupabaseAdmin();
  const applications = await Promise.all(
    (data ?? []).map(async (row: any) => ({
      ...row,
      photograph_url: await signedPath(admin, row.photograph_path),
      id_document_url: await signedPath(admin, row.id_document_path),
      cv_url: await signedPath(admin, row.cv_path)
    }))
  );

  return NextResponse.json({ applications, canReview: REVIEWER_ROLES.has(caller.role) });
}

export async function PATCH(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!REVIEWER_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Only HR or Director of Administration can review" }, { status: 403 });
  }

  const body = await request.json();
  const applicationId = String(body.applicationId ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  const reviewNote = body.reviewNote ? String(body.reviewNote).trim() : null;

  if (!applicationId) return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  if (!["approve", "reject", "under_review"].includes(decision)) {
    return NextResponse.json({ error: "decision must be approve, reject, or under_review" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: application, error: loadError } = await admin
    .from("staff_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (loadError || !application) {
    return NextResponse.json({ error: loadError?.message || "Application not found" }, { status: 404 });
  }

  if (application.status === "approved" && decision === "approve") {
    return NextResponse.json({ error: "This application is already approved" }, { status: 400 });
  }

  if (decision === "under_review") {
    const { data, error } = await admin
      .from("staff_applications")
      .update({
        status: "under_review",
        review_note: reviewNote,
        reviewed_by: caller.userId,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", applicationId)
      .select("id, status")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ application: data });
  }

  if (decision === "reject") {
    const { data, error } = await admin
      .from("staff_applications")
      .update({
        status: "rejected",
        review_note: reviewNote,
        reviewed_by: caller.userId,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", applicationId)
      .select("id, status, reference_code")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ application: data });
  }

  const { data: staffNumber, error: numberError } = await admin.rpc("allocate_staff_number", {
    p_department_id: application.department_id
  });
  if (numberError || !staffNumber) {
    return NextResponse.json({ error: numberError?.message || "Could not issue a staff number" }, { status: 400 });
  }

  const { data: staff, error: staffError } = await admin
    .from("staff")
    .insert({
      staff_number: staffNumber,
      department_id: application.department_id,
      full_name: application.full_name,
      preferred_name: application.preferred_name,
      job_title: application.job_title,
      phone: application.phone,
      personal_email: application.personal_email,
      work_email: application.work_email,
      start_date: application.start_date,
      status: application.employment_status,
      date_of_birth: application.date_of_birth,
      sex: application.sex,
      nationality: application.nationality,
      home_address: application.home_address,
      next_of_kin_name: application.next_of_kin_name,
      next_of_kin_phone: application.next_of_kin_phone,
      government_id_type: application.government_id_type,
      government_id_number: application.government_id_number,
      nin: application.nin,
      bvn: application.bvn,
      bank_name: application.bank_name,
      bank_account: application.bank_account || "pending",
      highest_qualification: application.highest_qualification,
      blood_group: application.blood_group,
      proposed_ims_role: application.proposed_ims_role,
      employment_type: application.employment_type,
      staff_type: application.staff_type,
      work_location: application.work_location,
      biometric_consent: application.biometric_consent,
      biometric_method: application.biometric_method,
      biometric_ready: application.biometric_ready,
      biometric_note: application.biometric_note,
      annual_leave_days: application.annual_leave_days ?? 10,
      photograph_path: application.photograph_path,
      created_by: caller.userId
    })
    .select("id, staff_number, full_name")
    .single();

  if (staffError || !staff) {
    return NextResponse.json({ error: staffError?.message || "Could not create staff record" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await admin
    .from("staff_applications")
    .update({
      status: "approved",
      review_note: reviewNote,
      reviewed_by: caller.userId,
      reviewed_at: new Date().toISOString(),
      staff_id: staff.id
    })
    .eq("id", applicationId)
    .select("id, status, reference_code, staff_id")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({
    application: updated,
    staff,
    message: `${staff.full_name} approved as ${staff.staff_number}.`
  });
}
