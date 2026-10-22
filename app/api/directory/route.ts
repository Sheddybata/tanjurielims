import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, peopleAccessScope } from "@/lib/ims/service-server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const db = admin();
  const access = await peopleAccessScope(caller, db);
  if (access.departmentIds && access.departmentIds.length === 0) {
    return NextResponse.json({ people: [], scope: access.scope });
  }

  let query = db
    .from("staff")
    .select(
      "id, staff_number, full_name, preferred_name, job_title, phone, work_email, photograph_path, department_id, profile_id, departments(name, code, subsidiaries(name))"
    )
    .not("status", "in", "(resigned,retired,dismissed)")
    .order("full_name")
    .range(0, 4999);

  if (access.departmentIds) {
    query = query.in("department_id", access.departmentIds);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const storage = getSupabaseAdmin();
  const people = await Promise.all(
    (data ?? []).map(async (row: any) => {
      let photoUrl: string | null = null;
      if (row.photograph_path) {
        const { data: signed } = await storage.storage.from("staff-applications").createSignedUrl(row.photograph_path, 60 * 30);
        photoUrl = signed?.signedUrl ?? null;
      }
      const department = Array.isArray(row.departments) ? row.departments[0] : row.departments;
      const subsidiary = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
      return {
        id: row.id,
        staffNumber: row.staff_number,
        fullName: row.full_name,
        preferredName: row.preferred_name,
        jobTitle: row.job_title,
        phone: row.phone,
        email: row.work_email,
        photoUrl,
        departmentId: row.department_id,
        profileId: row.profile_id,
        department: department?.name ?? "",
        subsidiary: subsidiary?.name ?? ""
      };
    })
  );

  return NextResponse.json({ people, scope: access.scope });
}
