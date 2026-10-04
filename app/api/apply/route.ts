import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import {
  generateApplicationReference,
  optionalString,
  requiredString
} from "@/lib/ims/apply";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function assertFile(file: File | null, label: string, required = false) {
  if (!file || file.size === 0) {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (file.size > MAX_FILE_BYTES) throw new Error(`${label} must be 5MB or smaller`);
  return file;
}

async function uploadApplicationFile(
  admin: ReturnType<typeof getSupabaseAdmin>,
  reference: string,
  folder: string,
  file: File
) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${reference}/${folder}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from("staff-applications").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const admin = getSupabaseAdmin();

    const fullName = requiredString(form.get("fullName"), "Full legal name");
    const preferredName = optionalString(form.get("preferredName"));
    const sex = requiredString(form.get("sex"), "Gender");
    const dateOfBirth = requiredString(form.get("dateOfBirth"), "Date of birth");
    const nationality = requiredString(form.get("nationality"), "Nationality");
    const phone = requiredString(form.get("phone"), "Phone");
    const personalEmail = requiredString(form.get("personalEmail"), "Personal email");
    const workEmail = optionalString(form.get("workEmail"));
    const homeAddress = requiredString(form.get("homeAddress"), "Residential address");
    const nextOfKinName = requiredString(form.get("nextOfKinName"), "Next of kin name");
    const nextOfKinPhone = requiredString(form.get("nextOfKinPhone"), "Next of kin phone");

    const staffType = requiredString(form.get("staffType"), "Staff type");
    const employmentType = requiredString(form.get("employmentType"), "Employment type");
    const employmentStatus = requiredString(form.get("employmentStatus"), "Employment status");
    const startDate = requiredString(form.get("startDate"), "Date joined");
    const subsidiaryId = optionalString(form.get("subsidiaryId"));
    const departmentId = requiredString(form.get("departmentId"), "Department");
    const jobTitle = requiredString(form.get("jobTitle"), "Job title");
    const proposedImsRole = requiredString(form.get("proposedImsRole"), "IMS role");
    const reportsToName = optionalString(form.get("reportsToName"));
    const workLocation = optionalString(form.get("workLocation"));

    const governmentIdType = requiredString(form.get("governmentIdType"), "Means of ID type");
    const governmentIdNumber = requiredString(form.get("governmentIdNumber"), "Means of ID number");
    const nin = optionalString(form.get("nin"));
    const bvn = optionalString(form.get("bvn"));
    const bankName = optionalString(form.get("bankName"));
    const bankAccount = optionalString(form.get("bankAccount"));
    const highestQualification = optionalString(form.get("highestQualification"));
    const bloodGroup = optionalString(form.get("bloodGroup"));

    const biometricConsent = String(form.get("biometricConsent") ?? "") === "true" || form.get("biometricConsent") === "on";
    if (!biometricConsent) {
      return NextResponse.json({ error: "Biometric enrollment consent is required" }, { status: 400 });
    }
    const biometricMethod = requiredString(form.get("biometricMethod"), "Preferred biometric method");
    const biometricReadyRaw = requiredString(form.get("biometricReady"), "Biometric readiness");
    const biometricReady = biometricReadyRaw === "yes";
    const biometricNote = optionalString(form.get("biometricNote"));

    const annualLeaveDays = Number(form.get("annualLeaveDays") ?? 10);
    if (!Number.isInteger(annualLeaveDays) || annualLeaveDays < 10 || annualLeaveDays > 20) {
      return NextResponse.json({ error: "Annual leave days must be from 10 to 20" }, { status: 400 });
    }

    const loginUnderstood =
      String(form.get("loginUnderstood") ?? "") === "true" || form.get("loginUnderstood") === "on";
    if (!loginUnderstood) {
      return NextResponse.json(
        { error: "Confirm that HR/Admin will issue your IMS password after review" },
        { status: 400 }
      );
    }

    const photograph = assertFile(form.get("photograph") as File | null, "Passport photograph", true);
    const idDocument = assertFile(form.get("idDocument") as File | null, "ID document", true);
    const cv = assertFile(form.get("cv") as File | null, "CV", false);

    const { data: department, error: departmentError } = await admin
      .from("departments")
      .select("id, subsidiary_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (departmentError || !department) {
      return NextResponse.json({ error: "Selected department was not found" }, { status: 400 });
    }

    const reference = generateApplicationReference();
    const photographPath = await uploadApplicationFile(admin, reference, "photo", photograph!);
    const idDocumentPath = await uploadApplicationFile(admin, reference, "id", idDocument!);
    const cvPath = cv ? await uploadApplicationFile(admin, reference, "cv", cv) : null;

    const { data, error } = await admin
      .from("staff_applications")
      .insert({
        reference_code: reference,
        status: "submitted",
        staff_type: staffType,
        employment_type: employmentType,
        employment_status: employmentStatus,
        full_name: fullName,
        preferred_name: preferredName,
        sex,
        date_of_birth: dateOfBirth,
        nationality,
        phone,
        personal_email: personalEmail,
        work_email: workEmail,
        home_address: homeAddress,
        next_of_kin_name: nextOfKinName,
        next_of_kin_phone: nextOfKinPhone,
        subsidiary_id: subsidiaryId ?? department.subsidiary_id,
        department_id: departmentId,
        job_title: jobTitle,
        proposed_ims_role: proposedImsRole,
        reports_to_name: reportsToName,
        work_location: workLocation,
        start_date: startDate,
        government_id_type: governmentIdType,
        government_id_number: governmentIdNumber,
        nin,
        bvn,
        bank_name: bankName,
        bank_account: bankAccount,
        highest_qualification: highestQualification,
        blood_group: bloodGroup,
        biometric_consent: true,
        biometric_method: biometricMethod,
        biometric_ready: biometricReady,
        biometric_note: biometricNote,
        annual_leave_days: annualLeaveDays,
        photograph_path: photographPath,
        id_document_path: idDocumentPath,
        cv_path: cvPath
      })
      .select("id, reference_code, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      application: data,
      message: `Submitted. Keep your reference ${data.reference_code}. Staff ID is issued after HR or Director of Administration review.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit application" },
      { status: 400 }
    );
  }
}
