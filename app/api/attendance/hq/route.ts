import { NextRequest, NextResponse } from "next/server";
import { readHqClock } from "@/lib/ims/hq-clock";
import { linkClockToStaff, type HqStaffMatch } from "@/lib/ims/hq-roster";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, peopleAccessScope } from "@/lib/ims/service-server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set(["chairman", "managing_director", "general_manager", "director_of_administration", "human_resources"]);
const CLOSED = new Set(["resigned", "retired", "dismissed"]);

function placeOf(row: { departments?: { name?: string; subsidiaries?: { name?: string } | Array<{ name?: string }> | null } | Array<{ name?: string; subsidiaries?: { name?: string } | Array<{ name?: string }> | null }> | null }) {
  const department = Array.isArray(row.departments) ? row.departments[0] : row.departments;
  const nested = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
  if (nested?.name && department?.name) return `${nested.name} · ${department.name}`;
  return department?.name || "";
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!READ_ROLES.has(caller.role)) return NextResponse.json({ error: "You cannot view headquarters attendance" }, { status: 403 });

  const db = admin();
  const access = await peopleAccessScope(caller, db);
  let query = db
    .from("staff")
    .select("id, full_name, preferred_name, job_title, status, photograph_path, departments(name, subsidiaries(name))")
    .order("full_name");
  if (access.departmentIds) query = query.in("department_id", access.departmentIds);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const storage = getSupabaseAdmin();
  const staff: HqStaffMatch[] = await Promise.all(
    (data ?? [])
      .filter((row) => !CLOSED.has(String(row.status ?? "")))
      .map(async (row) => {
        let photoUrl: string | null = null;
        if (row.photograph_path) {
          const { data: signed } = await storage.storage.from("staff-applications").createSignedUrl(row.photograph_path, 60 * 30);
          photoUrl = signed?.signedUrl ?? null;
        }
        return {
          id: row.id as string,
          fullName: String(row.full_name ?? ""),
          preferredName: (row.preferred_name as string | null) ?? null,
          jobTitle: String(row.job_title ?? ""),
          place: placeOf(row as never),
          photoUrl
        };
      })
  );

  try {
    const clock = await readHqClock();
    const people = linkClockToStaff(clock.people, staff, clock.punches);
    return NextResponse.json({
      clockReachable: true,
      linked: people.filter((person) => person.linked).length,
      people
    });
  } catch (clockError) {
    const message = clockError instanceof Error ? clockError.message : "The clock did not answer";
    return NextResponse.json({
      clockReachable: false,
      clockError: message,
      linked: 0,
      people: staff
        .map((person) => ({
          id: person.id,
          devicePin: "",
          name: person.fullName,
          jobTitle: person.jobTitle || "Staff",
          place: person.place,
          photoUrl: person.photoUrl ?? null,
          linked: true,
          punches: [] as string[]
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    });
  }
}
