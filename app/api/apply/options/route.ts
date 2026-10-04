import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export async function GET() {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("departments")
      .select("id, name, code, subsidiary_id, subsidiaries(id, name, code, sort_order)")
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const departments = (data ?? []).map((row: any) => {
      const subsidiary = Array.isArray(row.subsidiaries) ? row.subsidiaries[0] : row.subsidiaries;
      return {
        id: row.id as string,
        name: row.name as string,
        code: (row.code as string | null) ?? null,
        subsidiaryId: (row.subsidiary_id as string | null) ?? subsidiary?.id ?? null,
        subsidiaryName: (subsidiary?.name as string | null) ?? null,
        subsidiaryCode: (subsidiary?.code as string | null) ?? null
      };
    });

    return NextResponse.json({ departments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load departments" },
      { status: 500 }
    );
  }
}
