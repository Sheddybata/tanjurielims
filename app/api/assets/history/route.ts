import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin } from "@/lib/ims/service-server";

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const code = request.nextUrl.searchParams.get("assetId");
  if (!code) return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  const db = admin();
  const { data: asset, error: assetError } = await db
    .from("assets")
    .select("id, asset_id, name, status, department_id")
    .eq("asset_id", code)
    .maybeSingle();
  if (assetError || !asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const { data, error } = await db
    .from("asset_work_log")
    .select("id, work_date, fault, action, parts, cost, status, created_at, profiles:performed_by(full_name)")
    .eq("asset_id", asset.id)
    .order("work_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ asset, log: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!["manager", "department_head", "executive_director", "director_of_administration", "general_manager", "chairman"].includes(caller.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const body = await request.json();
  const db = admin();
  const { data: asset } = await db
    .from("assets")
    .select("id, department_id")
    .eq("asset_id", String(body.assetId ?? ""))
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  if (
    (caller.role === "manager" || caller.role === "department_head") &&
    (!caller.departmentId || asset.department_id !== caller.departmentId)
  ) {
    return NextResponse.json({ error: "You can only log work on assets in your department." }, { status: 403 });
  }
  const { data, error } = await db
    .from("asset_work_log")
    .insert({
      asset_id: asset.id,
      work_date: body.workDate || new Date().toISOString().slice(0, 10),
      fault: body.fault ? String(body.fault).trim() : null,
      action: String(body.action ?? "").trim(),
      parts: body.parts ? String(body.parts).trim() : null,
      cost: Number(body.cost ?? 0),
      performed_by: caller.userId,
      status: "completed"
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data });
}
