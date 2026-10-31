import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, resolveCallerScope } from "@/lib/ims/service-server";
import { isConstructionDepartment, isMissingTableError } from "@/lib/ims/service";

const WRITE_ROLES = new Set([
  "manager",
  "department_head",
  "executive_director",
  "director_of_administration",
  "general_manager",
  "chairman"
]);

async function constructionDepartment(db: ReturnType<typeof admin>, departmentId: string) {
  const { data } = await db
    .from("departments")
    .select("id, name, code, subsidiary_id, subsidiaries(code, name)")
    .eq("id", departmentId)
    .maybeSingle();
  return {
    department: data,
    allowed: isConstructionDepartment({ code: data?.code, name: data?.name })
  };
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const db = admin();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole
    ? caller.departmentId
    : request.nextUrl.searchParams.get("departmentId") || caller.departmentId;
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const { department, allowed } = await constructionDepartment(db, departmentId);
  if (!allowed) {
    return NextResponse.json({ error: "Site book is only for the Construction desk", site: false, projects: [] });
  }
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only see construction work in your subsidiary" }, { status: 403 });
    }
  }

  const { data: projects, error: projectError } = await db
    .from("construction_projects")
    .select("id, display_code, name, location, state, work_type, client, start_date, status, is_default, note")
    .eq("department_id", departmentId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (projectError) {
    if (isMissingTableError(projectError)) {
      return NextResponse.json({ site: true, department, projects: [], crew: [], logs: [], needsMigration: true });
    }
    return NextResponse.json({ error: projectError.message }, { status: 400 });
  }

  const projectId = request.nextUrl.searchParams.get("projectId") || projects?.[0]?.id;
  let crew: any[] = [];
  let logs: any[] = [];
  if (projectId) {
    const [{ data: crewRows }, { data: logRows }] = await Promise.all([
      db
        .from("construction_crew")
        .select(
          "id, role_on_site, assigned_on, left_on, staff(id, full_name, preferred_name, staff_number, job_title, phone, photograph_path, profile_id, status)"
        )
        .eq("project_id", projectId)
        .is("left_on", null)
        .order("assigned_on"),
      db
        .from("construction_site_logs")
        .select("id, log_date, crew_present, work_done, equipment, materials, weather, challenges, created_at, profiles:entered_by(full_name)")
        .eq("project_id", projectId)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40)
    ]);
    crew = await Promise.all(
      (crewRows ?? []).map(async (row: any) => {
        const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff;
        let photoUrl: string | null = null;
        if (staff?.photograph_path) {
          const { data: signed } = await db.storage
            .from("staff-applications")
            .createSignedUrl(staff.photograph_path, 60 * 30);
          photoUrl = signed?.signedUrl ?? null;
        }
        return {
          id: row.id,
          roleOnSite: row.role_on_site,
          assignedOn: row.assigned_on,
          staffId: staff?.id ?? null,
          fullName: staff?.full_name ?? "Staff",
          preferredName: staff?.preferred_name ?? null,
          staffNumber: staff?.staff_number ?? null,
          jobTitle: staff?.job_title ?? null,
          phone: staff?.phone ?? null,
          status: staff?.status ?? null,
          photoUrl,
          hasLogin: Boolean(staff?.profile_id)
        };
      })
    );
    logs = logRows ?? [];
  }

  return NextResponse.json({
    site: true,
    department,
    projects: projects ?? [],
    projectId,
    crew,
    logs
  });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITE_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Not allowed to write the site book" }, { status: 403 });
  }

  const body = await request.json();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? String(caller.departmentId || "") : String(body.departmentId || caller.departmentId || "");
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const db = admin();
  const { department, allowed } = await constructionDepartment(db, departmentId);
  if (!allowed) return NextResponse.json({ error: "Site book is only for the Construction desk" }, { status: 400 });
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only write site notes in your subsidiary" }, { status: 403 });
    }
  }

  const workDone = String(body.workDone ?? "").trim();
  if (!workDone) return NextResponse.json({ error: "Write what was done on site today" }, { status: 400 });

  let projectId = String(body.projectId ?? "").trim();
  if (!projectId) {
    const { data: project } = await db
      .from("construction_projects")
      .select("id")
      .eq("department_id", departmentId)
      .eq("is_default", true)
      .maybeSingle();
    projectId = project?.id ?? "";
  }
  if (!projectId) {
    return NextResponse.json({ error: "No construction project is open yet." }, { status: 400 });
  }

  const { data, error } = await db
    .from("construction_site_logs")
    .insert({
      project_id: projectId,
      department_id: departmentId,
      log_date: body.logDate || new Date().toISOString().slice(0, 10),
      crew_present: Number(body.crewPresent ?? 0),
      work_done: workDone,
      equipment: body.equipment ? String(body.equipment).trim() : null,
      materials: body.materials ? String(body.materials).trim() : null,
      weather: body.weather ? String(body.weather).trim() : null,
      challenges: body.challenges ? String(body.challenges).trim() : null,
      entered_by: caller.userId
    })
    .select("id")
    .single();
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "Run supabase/migrations/202610300001_construction_site.sql in the Supabase SQL editor, then refresh." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ log: data });
}
