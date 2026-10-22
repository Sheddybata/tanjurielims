import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin } from "@/lib/ims/service-server";
import { FALLBACK_CATEGORIES, isMissingTableError } from "@/lib/ims/service";

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const { data, error } = await admin()
    .from("request_categories")
    .select("*")
    .order("sort_order");
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ categories: FALLBACK_CATEGORIES, canWrite: false, needsMigration: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const canWrite = ["director_of_administration", "human_resources"].includes(caller.role);
  const categories = (data ?? []).filter((row) => row.is_active || canWrite);
  return NextResponse.json({ categories, canWrite, needsMigration: false });
}

export async function PATCH(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!["director_of_administration", "human_resources"].includes(caller.role)) {
    return NextResponse.json({ error: "Only HR or Director of Administration can edit request types" }, { status: 403 });
  }
  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.description != null) patch.description = String(body.description).trim();
  if (body.is_active != null) patch.is_active = Boolean(body.is_active);
  if (body.questions != null) patch.questions = body.questions;
  if (body.needs_fulfilment != null) patch.needs_fulfilment = Boolean(body.needs_fulfilment);
  const { data, error } = await admin()
    .from("request_categories")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ category: data });
}
