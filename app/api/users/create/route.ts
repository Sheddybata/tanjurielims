import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { roleToDb, type UiRole } from "@/lib/ims/mappers";

type CreateUserBody = {
  email: string;
  password: string;
  fullName: string;
  role: UiRole;
  departmentId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
    }

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await caller
      .from("profiles")
      .select("role, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || !profile?.is_active || !["chairman", "general_manager"].includes(profile.role)) {
      return NextResponse.json({ error: "Only Chairman or General Manager can create users" }, { status: 403 });
    }

    const body = (await request.json()) as CreateUserBody;
    if (!body.email || !body.password || !body.fullName || !body.role) {
      return NextResponse.json({ error: "email, password, fullName, and role are required" }, { status: 400 });
    }

    if (body.role === "department-head" && !body.departmentId) {
      return NextResponse.json({ error: "departmentId is required for Department Head" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.fullName, role: body.role }
    });

    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message || "Failed to create auth user" }, { status: 400 });
    }

    const { error: insertError } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: body.fullName,
      role: roleToDb[body.role],
      department_id: body.role === "department-head" ? body.departmentId : null,
      is_active: true
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({
      id: created.user.id,
      email: body.email,
      fullName: body.fullName,
      role: body.role
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
