import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import {
  addEvent,
  admin,
  answersToTitle,
  createLinkedLeave,
  findApproverId,
  findDepartmentByCode,
  generateRequestReference,
  resolveCallerScope,
  resolveSubjectStaff,
  validateAnswers
} from "@/lib/ims/service-server";
import { canRaiseForTeam, isMissingTableError, questionsForCategory, type RequestQuestion } from "@/lib/ims/service";

const SELECT = `
  id, reference_code, status, title, answers, requester_id, department_id, subsidiary_id,
  waiting_on_id, assigned_to_id, assigned_department_id, asset_uuid, leave_request_id, review_note,
  created_at, updated_at,
  request_categories(id, slug, name, needs_fulfilment, is_leave, questions, fulfil_department_code),
  requester:profiles!service_requests_requester_id_fkey(id, full_name, role),
  waiting:profiles!service_requests_waiting_on_id_fkey(id, full_name, role),
  assigned:profiles!service_requests_assigned_to_id_fkey(id, full_name, role),
  departments:departments!department_id(id, name, code),
  fulfil_department:departments!assigned_department_id(id, name, code)
`;

export async function GET(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const scope = request.nextUrl.searchParams.get("scope") || "mine";
  const db = admin();

  let query = db.from("service_requests").select(SELECT).order("created_at", { ascending: false });
  if (scope === "waiting") query = query.eq("waiting_on_id", caller.userId);
  else if (scope === "assigned") query = query.eq("assigned_to_id", caller.userId);
  else if (scope === "mine") query = query.eq("requester_id", caller.userId);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ requests: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  try {
    const body = await request.json();
    const categoryId = String(body.categoryId ?? "");
    const answers = (body.answers ?? {}) as Record<string, string>;
    if (!categoryId) return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    if (categoryId.startsWith("local-")) {
      return NextResponse.json(
        {
          error:
            "Requests are not live in the database yet. Run supabase/migrations/202610210001_service_lane.sql in the Supabase SQL editor, then refresh."
        },
        { status: 400 }
      );
    }

    const db = admin();
    const { data: category, error: catError } = await db
      .from("request_categories")
      .select("*")
      .eq("id", categoryId)
      .maybeSingle();
    if (catError || !category?.is_active) {
      return NextResponse.json({ error: "Request type was not found" }, { status: 404 });
    }

    validateAnswers(questionsForCategory(category) as RequestQuestion[], answers);
    if (canRaiseForTeam(caller.role) && answers.forWhom === "staff") {
      if (!answers.staffId) throw new Error("Choose the staff member this request is for");
      await resolveSubjectStaff(db, caller, answers);
    } else {
      answers.forWhom = answers.forWhom || "self";
    }
    const { departmentId, subsidiaryId } = await resolveCallerScope(caller, db);
    const approverId = await findApproverId(db, caller, subsidiaryId);
    if (!approverId) {
      return NextResponse.json(
        { error: "No approver is available for your role yet. Ask Admin to set managers or an Executive Director." },
        { status: 400 }
      );
    }

    let leaveRequestId: string | null = null;
    if (category.is_leave) {
      const leave = await createLinkedLeave(db, caller, answers);
      leaveRequestId = leave.id;
    }

    let assetUuid: string | null = null;
    if (answers.assetCode) {
      const { data: asset } = await db
        .from("assets")
        .select("id")
        .eq("asset_id", String(answers.assetCode).trim())
        .maybeSingle();
      assetUuid = asset?.id ?? null;
    }

    const fulfilDept = await findDepartmentByCode(db, category.fulfil_department_code);
    const { data, error } = await db
      .from("service_requests")
      .insert({
        reference_code: generateRequestReference(),
        category_id: category.id,
        status: "under_review",
        title: answersToTitle(category.name, answers),
        answers,
        requester_id: caller.userId,
        department_id: departmentId,
        subsidiary_id: subsidiaryId,
        waiting_on_id: approverId,
        assigned_department_id: fulfilDept?.id ?? null,
        asset_uuid: assetUuid,
        leave_request_id: leaveRequestId
      })
      .select(SELECT)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await addEvent(db, data.id, caller.userId, null, "under_review", "Submitted");
    return NextResponse.json({ request: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit request" },
      { status: 400 }
    );
  }
}
