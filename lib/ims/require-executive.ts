import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

export async function requireExecutive(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) {
    return { error: "Supabase is not configured", status: 500 as const };
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const { data: profile, error: profileError } = await caller
    .from("profiles")
    .select("role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active || !["chairman", "general_manager", "director_of_administration"].includes(profile.role)) {
    return { error: "Only the Chairman, General Manager, or Director of Administration can manage users", status: 403 as const };
  }

  return { userId: userData.user.id, role: profile.role as string };
}
