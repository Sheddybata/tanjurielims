import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

/**
 * One-time bootstrap: creates chairman@tanjuriel.com if missing.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
export async function POST() {
  try {
    const admin = getSupabaseAdmin();
    const email = "chairman@tanjuriel.com";
    const password = "Hermit@tanjuriel";
    const fullName = "Chairman, Tanjuriel Corporation";

    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 400 });
    }

    let userId = listed.users.find((user) => user.email?.toLowerCase() === email)?.id;

    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "chairman" }
      });
      if (createError || !created.user) {
        return NextResponse.json({ error: createError?.message || "Failed to create chairman" }, { status: 400 });
      }
      userId = created.user.id;
    }

    const { error: upsertError } = await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      role: "chairman",
      department_id: null,
      is_active: true
    });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      email,
      message: "Chairman account is ready. Sign in with the seeded credentials."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
