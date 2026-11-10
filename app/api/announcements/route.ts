import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin } from "@/lib/ims/service-server";
import { isMissingTableError } from "@/lib/ims/service";

const WRITERS = new Set(["chairman", "general_manager", "director_of_administration", "executive_director"]);

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const columns = [
    "id, title, body, audience, subsidiary_id, department_id, is_pinned, is_published, created_at, created_by, subsidiaries(name)",
    "id, title, body, audience, subsidiary_id, department_id, is_pinned, is_published, created_at, created_by"
  ];
  let data: any[] | null = null;
  let error: { message: string; code?: string } | null = null;
  for (const column of columns) {
    const result = await admin()
      .from("announcements")
      .select(column)
      .eq("is_published", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    data = result.data;
    error = result.error;
    if (!error) break;
  }
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ announcements: [], canWrite: WRITERS.has(caller.role), needsMigration: true, subsidiaries: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  let subsidiaries: Array<{ id: string; name: string }> = [];
  if (caller.role === "chairman") {
    const { data: rows } = await admin().from("subsidiaries").select("id, name").order("name");
    subsidiaries = (rows ?? []) as Array<{ id: string; name: string }>;
  }
  return NextResponse.json({
    announcements: data ?? [],
    canWrite: WRITERS.has(caller.role),
    subsidiaries: caller.role === "chairman" ? subsidiaries : null
  });
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
  if (caller.role === "chairman" && audience === "department") {
    return NextResponse.json({ error: "The Chairman sends a notice to the whole corporation or to one subsidiary" }, { status: 400 });
  }
  let subsidiaryId: string | null = null;
  if (audience === "subsidiary") {
    subsidiaryId = caller.role === "chairman" ? String(body.subsidiaryId ?? "") : caller.subsidiaryId;
    if (!subsidiaryId) return NextResponse.json({ error: "Choose a subsidiary" }, { status: 400 });
    if (caller.role === "chairman") {
      const { data: subsidiary } = await admin().from("subsidiaries").select("id").eq("id", subsidiaryId).maybeSingle();
      if (!subsidiary) return NextResponse.json({ error: "That subsidiary was not found" }, { status: 400 });
    }
  }
  const { data, error } = await admin()
    .from("announcements")
    .insert({
      title,
      body: text,
      audience,
      subsidiary_id: subsidiaryId,
      department_id: audience === "department" ? caller.departmentId || body.departmentId || null : null,
      is_pinned: Boolean(body.pinned),
      created_by: caller.userId
    })
    .select("id, title, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ announcement: data });
}
