import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const { data: profile } = await caller
      .from("profiles")
      .select("role, is_active, full_name")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile?.is_active || profile.role !== "chairman") {
      return NextResponse.json({ error: "Only the Chairman can archive executive summaries" }, { status: 403 });
    }

    const body = await request.json();
    const summaryText = String(body.summaryText ?? "");
    const reportingDate = String(body.reportingDate ?? new Date().toISOString().slice(0, 10));
    const totals = body.totals ?? {};
    const pdfBase64 = body.pdfBase64 ? String(body.pdfBase64) : "";

    if (!summaryText.trim()) {
      return NextResponse.json({ error: "summaryText is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    let pdfPath: string | null = null;

    if (pdfBase64) {
      const binary = Buffer.from(pdfBase64, "base64");
      const path = `${reportingDate}/executive-summary-${Date.now()}.pdf`;
      const { error: uploadError } = await admin.storage.from("executive-summaries").upload(path, binary, {
        contentType: "application/pdf",
        upsert: false
      });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 400 });
      }
      pdfPath = path;
    }

    const { data, error } = await admin
      .from("executive_summaries")
      .insert({
        reporting_date: reportingDate,
        generated_by: userData.user.id,
        title: "Chairman Executive Summary",
        summary_text: summaryText,
        pdf_path: pdfPath,
        approved_report_count: Number(totals.approvedReportCount ?? 0),
        total_revenue: Number(totals.totalRevenue ?? 0),
        total_cash_in: Number(totals.totalCash ?? 0),
        total_expenses: Number(totals.totalExpenses ?? 0),
        asset_alert_count: Number(totals.alerts ?? 0)
      })
      .select("id, pdf_path, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      id: data.id,
      pdfPath: data.pdf_path,
      createdAt: data.created_at
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
