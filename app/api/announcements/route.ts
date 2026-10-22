import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin } from "@/lib/ims/service-server";
import { isMissingTableError } from "@/lib/ims/service";

const WRITERS = new Set(["chairman", "general_manager", "director_of_administration", "executive_director"]);

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const { data, error } = await admin()
    .from("announcements")
    .select("id, title, body, audience, subsidiary_id, department_id, is_pinned, is_published, created_at, created_by")
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ announcements: [], canWrite: WRITERS.has(caller.role), needsMigration: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ announcements: data ?? [], canWrite: WRITERS.has(caller.role) });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITERS.has(caller.role)) {
    return NextResponse.json({ error: "You cannot publish announcements" }, { status: 403 });
  }
  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!title || !text) return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  const audience = String(body.audience ?? "corp");
  const { data, error } = await admin()
    .from("announcements")
    .insert({
      title,
      body: text,
      audience,
      subsidiary_id: audience === "subsidiary" ? caller.subsidiaryId || body.subsidiaryId || null : null,
      department_id: audience === "department" ? caller.departmentId || body.departmentId || null : null,
      is_pinned: Boolean(body.pinned),
      created_by: caller.userId
    })
    .select("id, title, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ announcement: data });
}
