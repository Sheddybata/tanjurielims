import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";

const LETTER_TYPES = ["offer", "promotion", "transfer", "query", "warning", "suspension", "termination"];

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const { data, error } = await caller.supabase
    .from("staff_letters")
    .select("id, letter_type, reference_number, issued_at, storage_path, staff_id, staff(full_name, staff_number, departments(name, code))")
    .order("issued_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ letters: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  if (!body.staffId || !LETTER_TYPES.includes(body.letterType)) {
    return NextResponse.json({ error: "staffId and a valid letterType are required" }, { status: 400 });
  }

  const { data: person, error: personError } = await caller.supabase
    .from("staff")
    .select("id, department_id")
    .eq("id", body.staffId)
    .maybeSingle();
  if (personError || !person) return NextResponse.json({ error: "Staff record was not found" }, { status: 404 });

  const { data: reference, error: referenceError } = await caller.supabase.rpc("allocate_letter_reference", {
    p_department_id: person.department_id
  });
  if (referenceError || !reference) {
    return NextResponse.json({ error: referenceError?.message || "Could not issue a letter number" }, { status: 400 });
  }

  const { data, error } = await caller.supabase
    .from("staff_letters")
    .insert({
      staff_id: person.id,
      letter_type: body.letterType,
      reference_number: reference,
      issued_by: caller.userId
    })
    .select("id, letter_type, reference_number, issued_at, staff_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ letter: data });
}

export async function PATCH(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  const nextReference = String(body.referenceNumber ?? "").trim();
  if (!body.letterId || !nextReference) {
    return NextResponse.json({ error: "letterId and referenceNumber are required" }, { status: 400 });
  }

  const { data: current, error: currentError } = await caller.supabase
    .from("staff_letters")
    .select("id, reference_number")
    .eq("id", body.letterId)
    .maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: "Letter was not found" }, { status: 404 });
  if (current.reference_number === nextReference) {
    return NextResponse.json({ letter: current });
  }

  const { error: amendError } = await caller.supabase.from("staff_letter_amendments").insert({
    letter_id: current.id,
    previous_reference: current.reference_number,
    new_reference: nextReference,
    amended_by: caller.userId
  });
  if (amendError) return NextResponse.json({ error: amendError.message }, { status: 400 });

  const { data, error } = await caller.supabase
    .from("staff_letters")
    .update({ reference_number: nextReference })
    .eq("id", current.id)
    .select("id, reference_number")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ letter: data });
}
