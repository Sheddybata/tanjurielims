import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, resolveCallerScope } from "@/lib/ims/service-server";
import { isLoanDesk, isMissingTableError } from "@/lib/ims/service";

const WRITE_ROLES = new Set([
  "manager",
  "department_head",
  "executive_director",
  "director_of_administration",
  "general_manager",
  "chairman"
]);

function money(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITE_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Not allowed to record a repayment" }, { status: 403 });
  }

  const body = await request.json();
  const loanId = String(body.loanId ?? "").trim();
  const amount = money(body.amount);
  if (!loanId) return NextResponse.json({ error: "loanId is required" }, { status: 400 });
  if (amount <= 0) return NextResponse.json({ error: "Payment amount must be more than zero" }, { status: 400 });

  const db = admin();
  const { data: loan, error: loanError } = await db
    .from("loans")
    .select("id, department_id, outstanding, total_paid, status, departments(code, name, subsidiary_id, subsidiaries(code, name))")
    .eq("id", loanId)
    .maybeSingle();
  if (loanError) {
    if (isMissingTableError(loanError)) {
      return NextResponse.json({ error: "Run supabase/migrations/202610230001_loan_book.sql in the Supabase SQL editor, then refresh." }, { status: 400 });
    }
    return NextResponse.json({ error: loanError.message }, { status: 400 });
  }
  if (!loan) return NextResponse.json({ error: "Loan was not found" }, { status: 404 });

  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  if (fieldRole && loan.department_id !== caller.departmentId) {
    return NextResponse.json({ error: "You can only collect for loans in your department" }, { status: 403 });
  }

  const department = Array.isArray(loan.departments) ? loan.departments[0] : loan.departments;
  const subsidiary = Array.isArray(department?.subsidiaries) ? department?.subsidiaries[0] : department?.subsidiaries;
  const allowed = isLoanDesk({
    code: department?.code,
    name: department?.name,
    subsidiaryCode: subsidiary?.code,
    subsidiaryName: subsidiary?.name
  });
  if (!allowed) return NextResponse.json({ error: "Loan book is only for Microcredit and Banking desks" }, { status: 400 });
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (!subsidiaryId || department?.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only collect for loans in your subsidiary" }, { status: 403 });
    }
  }

  const outstanding = money(loan.outstanding);
  if (loan.status !== "active" || outstanding <= 0) {
    return NextResponse.json({ error: "This loan is already closed" }, { status: 400 });
  }
  if (amount - outstanding > 0.009) {
    return NextResponse.json({ error: `Amount is more than the balance of ₦${outstanding.toLocaleString("en-NG")}` }, { status: 400 });
  }

  const nextOutstanding = Math.round((outstanding - amount) * 100) / 100;
  const method = ["cash", "transfer", "pos"].includes(String(body.method)) ? String(body.method) : "cash";
  const { data: payment, error: paymentError } = await db
    .from("loan_payments")
    .insert({
      loan_id: loan.id,
      department_id: loan.department_id,
      paid_on: body.paidOn || new Date().toISOString().slice(0, 10),
      amount,
      method,
      note: body.note ? String(body.note).trim() : null,
      received_by: caller.userId
    })
    .select("id, paid_on, amount, method")
    .single();
  if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 400 });

  const { error: updateError } = await db
    .from("loans")
    .update({
      outstanding: nextOutstanding,
      total_paid: money(loan.total_paid) + amount,
      status: nextOutstanding <= 0 ? "paid" : "active",
      next_due_on: body.nextDueOn || null
    })
    .eq("id", loan.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({
    payment,
    outstanding: nextOutstanding,
    status: nextOutstanding <= 0 ? "paid" : "active"
  });
}
