import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { isCaller, requireCaller } from "@/lib/ims/require-user";

const DOC_TYPES = new Set([
  "employment_letter",
  "confirmation_letter",
  "certificates",
  "government_id",
  "passport_photograph",
  "next_of_kin",
  "guarantor",
  "posting_letter",
  "cv",
  "salary_slip",
  "basic_personal"
]);

const FILE_READERS = new Set(["chairman", "managing_director", "director_of_administration", "human_resources"]);

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!FILE_READERS.has(caller.role)) return NextResponse.json({ error: "You cannot open personnel files" }, { status: 403 });

  const staffId = request.nextUrl.searchParams.get("staffId");
  let query = caller.supabase
    .from("staff_documents")
    .select("id, staff_id, doc_type, storage_path, created_at")
    .order("created_at", { ascending: false });
  if (staffId) query = query.eq("staff_id", staffId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const form = await request.formData();
  const staffId = String(form.get("staffId") ?? "");
  const docType = String(form.get("docType") ?? "");
  const file = form.get("file");
  if (!staffId || !DOC_TYPES.has(docType) || !(file instanceof File)) {
    return NextResponse.json({ error: "staffId, docType, and file are required" }, { status: 400 });
  }

  const { data: person, error: personError } = await caller.supabase
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .maybeSingle();
  if (personError || !person) return NextResponse.json({ error: "Staff record was not found" }, { status: 404 });

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${staffId}/${docType}/${Date.now()}-${safeName}`;
  const admin = getSupabaseAdmin();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("staff-files").upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });

  const { data, error } = await caller.supabase
    .from("staff_documents")
    .insert({
      staff_id: staffId,
      doc_type: docType,
      storage_path: path,
      uploaded_by: caller.userId
    })
    .select("id, doc_type, storage_path, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (docType === "passport_photograph") {
    await caller.supabase.from("staff").update({ photograph_path: path }).eq("id", staffId);
  }

  return NextResponse.json({ document: data });
}
