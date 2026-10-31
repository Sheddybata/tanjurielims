import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { requireExecutive } from "@/lib/ims/require-executive";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireExecutive(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = getSupabaseAdmin();
    const rich = await admin
      .from("profiles")
      .select("id, full_name, role, is_active, departments(name, subsidiaries(name)), subsidiaries(name)")
      .order("created_at", { ascending: false });
    const plain = rich.error
      ? await admin.from("profiles").select("id, full_name, role, is_active, departments(name)").order("created_at", { ascending: false })
      : null;
    const profileResult = plain ?? rich;
    const profiles = profileResult.data;
    const profileError = profileResult.error;
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const emailById = new Map((authData.users ?? []).map((user) => [user.id, user.email ?? ""]));

    const profileIds = (profiles ?? []).map((profile: any) => profile.id as string);
    const [{ data: staffRows }, { data: unlinkedRows }] = await Promise.all([
      profileIds.length
        ? admin.from("staff").select("profile_id, job_title").in("profile_id", profileIds)
        : Promise.resolve({ data: [] as Array<{ profile_id: string; job_title: string | null }> }),
      admin
        .from("staff")
        .select("id, full_name, job_title, staff_number, department_id")
        .is("profile_id", null)
        .not("status", "in", "(resigned,retired,dismissed)")
        .order("full_name")
        .limit(500)
    ]);
    const jobByProfile = new Map((staffRows ?? []).map((row) => [row.profile_id as string, row.job_title as string | null]));

    const users = (profiles ?? []).map((profile: any) => {
      const departmentRow = Array.isArray(profile.departments) ? profile.departments[0] : profile.departments;
      const departmentSubsidiary = Array.isArray(departmentRow?.subsidiaries)
        ? departmentRow?.subsidiaries[0]?.name
        : departmentRow?.subsidiaries?.name;
      const ownSubsidiary = Array.isArray(profile.subsidiaries) ? profile.subsidiaries[0]?.name : profile.subsidiaries?.name;
      const departments = departmentRow
        ? { name: departmentRow.name as string, subsidiaryName: (departmentSubsidiary as string | undefined) ?? null }
        : null;

      return {
        id: profile.id as string,
        full_name: profile.full_name as string,
        role: profile.role as string,
        jobTitle: jobByProfile.get(profile.id as string) || null,
        is_active: Boolean(profile.is_active),
        email: emailById.get(profile.id as string) || "",
        subsidiaryName: (ownSubsidiary as string | undefined) ?? null,
        departments
      };
    });

    return NextResponse.json({
      users,
      staffWithoutLogin: (unlinkedRows ?? []).map((row) => ({
        id: row.id as string,
        fullName: row.full_name as string,
        jobTitle: (row.job_title as string | null) ?? "",
        staffNumber: (row.staff_number as string | null) ?? "",
        departmentId: row.department_id as string
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
