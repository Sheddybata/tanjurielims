import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { DbRole } from "@/lib/ims/mappers";

export type Caller = {
  userId: string;
  role: DbRole;
  departmentId: string | null;
  supabase: SupabaseClient;
};

export async function requireCaller(request: NextRequest): Promise<Caller | { error: string; status: number }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anonKey) return { error: "Supabase is not configured", status: 500 };

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { error: "Unauthorized", status: 401 };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, department_id, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_active) return { error: "Unauthorized", status: 401 };

  return {
    userId: userData.user.id,
    role: profile.role as DbRole,
    departmentId: profile.department_id ?? null,
    supabase
  };
}

export function isCaller(value: Caller | { error: string; status: number }): value is Caller {
  return !("error" in value);
}
