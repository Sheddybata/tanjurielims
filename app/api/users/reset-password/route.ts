import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { requireExecutive } from "@/lib/ims/require-executive";

type ResetBody = {
  userId?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireExecutive(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as ResetBody;
    if (!body.userId || !body.password) {
      return NextResponse.json({ error: "userId and password are required" }, { status: 400 });
    }
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", body.userId)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { data: authUser, error: updateError } = await admin.auth.admin.updateUserById(body.userId, {
      password: body.password
    });

    if (updateError || !authUser.user) {
      return NextResponse.json({ error: updateError?.message || "Failed to reset password" }, { status: 400 });
    }

    return NextResponse.json({
      id: profile.id,
      fullName: profile.full_name,
      role: profile.role,
      email: authUser.user.email ?? "",
      password: body.password
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
