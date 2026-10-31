import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, resolveCallerScope } from "@/lib/ims/service-server";
import { generateLoanCode, isLoanDesk, isMissingTableError } from "@/lib/ims/service";

const WRITE_ROLES = new Set([
  "manager",
  "department_head",
  "executive_director",
  "director_of_administration",
  "general_manager",
  "chairman"
]);

const LOAN_SELECT =
  "id, display_code, department_id, principal, total_due, outstanding, total_paid, installment_amount, frequency, purpose, status, disbursed_on, next_due_on, created_at, loan_borrowers(id, full_name, phone, address)";

async function loanDepartment(db: ReturnType<typeof admin>, departmentId: string) {
  const { data } = await db
    .from("departments")
    .select("id, name, code, subsidiary_id, subsidiaries(code, name)")
    .eq("id", departmentId)
    .maybeSingle();
  const subsidiary = Array.isArray(data?.subsidiaries) ? data?.subsidiaries[0] : data?.subsidiaries;
  return {
    department: data,
    allowed: isLoanDesk({
      code: data?.code,
      name: data?.name,
      subsidiaryCode: subsidiary?.code,
      subsidiaryName: subsidiary?.name
    })
  };
}

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const db = admin();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole
    ? caller.departmentId
    : request.nextUrl.searchParams.get("departmentId") || caller.departmentId;
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const { department, allowed } = await loanDepartment(db, departmentId);
  if (!allowed) {
    return NextResponse.json({ error: "Loan book is only for Microcredit and Banking desks", loans: false, loansList: [] });
  }
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only see loans in your subsidiary" }, { status: 403 });
    }
  }

  const queryText = String(request.nextUrl.searchParams.get("q") ?? "").trim();
  const loanId = request.nextUrl.searchParams.get("id");
  let query = db.from("loans").select(LOAN_SELECT).eq("department_id", departmentId).order("created_at", { ascending: false }).limit(120);
  if (loanId) query = query.eq("id", loanId);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ loans: true, department, items: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let items = data ?? [];
  if (queryText) {
    const needle = queryText.toLowerCase();
    items = items.filter((row: any) => {
      const borrower = Array.isArray(row.loan_borrowers) ? row.loan_borrowers[0] : row.loan_borrowers;
      return [borrower?.full_name, borrower?.phone, row.display_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }

  let payments: any[] = [];
  if (loanId && items[0]) {
    const { data: paymentRows } = await db
      .from("loan_payments")
      .select("id, paid_on, amount, method, note, created_at, profiles:received_by(full_name)")
      .eq("loan_id", loanId)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false });
    payments = paymentRows ?? [];
  }

  const active = items.filter((row: any) => row.status === "active");
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayPayments } = await db
    .from("loan_payments")
    .select("amount")
    .eq("department_id", departmentId)
    .eq("paid_on", today);

  return NextResponse.json({
    loans: true,
    department,
    items,
    payments,
    collectedToday: (todayPayments ?? []).reduce((sum, row) => sum + money(row.amount), 0),
    outstandingTotal: active.reduce((sum: number, row: any) => sum + money(row.outstanding), 0),
    activeCount: active.length
  });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITE_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Not allowed to open a loan" }, { status: 403 });
  }

  const body = await request.json();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? String(caller.departmentId || "") : String(body.departmentId || caller.departmentId || "");
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const db = admin();
  const { department, allowed } = await loanDepartment(db, departmentId);
  if (!allowed) return NextResponse.json({ error: "Loan book is only for Microcredit and Banking desks" }, { status: 400 });
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only open loans in your subsidiary" }, { status: 403 });
    }
  }

  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const principal = money(body.principal);
  const totalDue = money(body.totalDue || body.principal);
  if (!fullName) return NextResponse.json({ error: "Borrower name is required" }, { status: 400 });
  if (principal <= 0) return NextResponse.json({ error: "Amount given must be more than zero" }, { status: 400 });
  if (totalDue < principal) return NextResponse.json({ error: "Amount to recover cannot be less than the amount given" }, { status: 400 });

  let borrowerId = String(body.borrowerId ?? "").trim();
  if (!borrowerId) {
    if (phone) {
      const { data: existing } = await db
        .from("loan_borrowers")
        .select("id")
        .eq("department_id", departmentId)
        .eq("phone", phone)
        .maybeSingle();
      borrowerId = existing?.id ?? "";
    }
    if (!borrowerId) {
      const { data: borrower, error: borrowerError } = await db
        .from("loan_borrowers")
        .insert({
          department_id: departmentId,
          full_name: fullName,
          phone: phone || null,
          address: body.address ? String(body.address).trim() : null,
          note: body.borrowerNote ? String(body.borrowerNote).trim() : null,
          created_by: caller.userId
        })
        .select("id")
        .single();
      if (borrowerError) {
        if (isMissingTableError(borrowerError)) {
          return NextResponse.json({ error: "Run supabase/migrations/202610230001_loan_book.sql in the Supabase SQL editor, then refresh." }, { status: 400 });
        }
        return NextResponse.json({ error: borrowerError.message }, { status: 400 });
      }
      borrowerId = borrower.id;
    }
  }

  const frequency = ["weekly", "monthly", "lump_sum"].includes(String(body.frequency)) ? String(body.frequency) : "weekly";
  const { data, error } = await db
    .from("loans")
    .insert({
      display_code: generateLoanCode(),
      department_id: departmentId,
      borrower_id: borrowerId,
      principal,
      total_due: totalDue,
      outstanding: totalDue,
      total_paid: 0,
      installment_amount: body.installmentAmount ? money(body.installmentAmount) : null,
      frequency,
      purpose: body.purpose ? String(body.purpose).trim() : null,
      status: "active",
      disbursed_on: body.disbursedOn || new Date().toISOString().slice(0, 10),
      next_due_on: body.nextDueOn || null,
      entered_by: caller.userId
    })
    .select("id, display_code")
    .single();
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ error: "Run supabase/migrations/202610230001_loan_book.sql in the Supabase SQL editor, then refresh." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ loan: data });
}
