import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, resolveCallerScope } from "@/lib/ims/service-server";
import { isBankingFinance, isMissingTableError } from "@/lib/ims/service";

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const db = admin();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? caller.departmentId : request.nextUrl.searchParams.get("departmentId") || caller.departmentId;
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const { data: department } = await db
    .from("departments")
    .select("id, name, code, subsidiary_id, subsidiaries(code, name)")
    .eq("id", departmentId)
    .maybeSingle();
  const subsidiary = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
  const allowed = isBankingFinance({
    code: department?.code,
    name: department?.name,
    subsidiaryCode: subsidiary?.code,
    subsidiaryName: subsidiary?.name
  });
  if (!allowed) {
    return NextResponse.json({ error: "Cash book is only for Banking and Finance logins", money: false, entries: [] });
  }
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "Cash book is only for Banking and Finance inside your subsidiary" }, { status: 403 });
    }
  }

  const { data, error } = await db
    .from("cash_entries")
    .select("*")
    .eq("department_id", departmentId)
    .order("entry_date", { ascending: false })
    .limit(60);
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ money: true, department, entries: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ money: true, department, entries: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!["manager", "department_head", "executive_director", "director_of_administration", "general_manager", "chairman"].includes(caller.role)) {
    return NextResponse.json({ error: "Not allowed to enter cash" }, { status: 403 });
  }
  const body = await request.json();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? String(caller.departmentId || "") : String(body.departmentId || caller.departmentId || "");
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
  const { data: department } = await admin()
    .from("departments")
    .select("id, name, code, subsidiary_id, subsidiaries(code, name)")
    .eq("id", departmentId)
    .maybeSingle();
  const subsidiary = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
  const allowed = isBankingFinance({
    code: department?.code,
    name: department?.name,
    subsidiaryCode: subsidiary?.code,
    subsidiaryName: subsidiary?.name
  });
  if (!allowed) return NextResponse.json({ error: "Cash book is only for Banking and Finance logins" }, { status: 400 });
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, admin());
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only enter cash for Banking and Finance in your subsidiary" }, { status: 403 });
    }
  }
  const cashIn = Number(body.cashIn ?? 0);
  const cashOut = Number(body.cashOut ?? 0);
  const opening = Number(body.openingBalance ?? 0);
  const { data, error } = await admin()
    .from("cash_entries")
    .insert({
      department_id: departmentId,
      entry_date: body.entryDate || new Date().toISOString().slice(0, 10),
      opening_balance: opening,
      cash_in: cashIn,
      cash_out: cashOut,
      closing_balance: opening + cashIn - cashOut,
      source: body.source ? String(body.source).trim() : null,
      purpose: body.purpose ? String(body.purpose).trim() : null,
      entered_by: caller.userId
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ entry: data });
}
