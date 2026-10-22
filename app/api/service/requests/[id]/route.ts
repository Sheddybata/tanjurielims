import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { addEvent, admin } from "@/lib/ims/service-server";

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

const REVIEWERS = new Set([
  "manager",
  "department_head",
  "executive_director",
  "director_of_administration",
  "human_resources",
  "general_manager",
  "chairman"
]);

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  const db = admin();
  const { data, error } = await db.from("service_requests").select(SELECT).eq("id", context.params.id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const { data: events } = await db
    .from("service_request_events")
    .select("id, from_status, to_status, note, created_at, actor:profiles!service_request_events_actor_id_fkey(full_name)")
    .eq("request_id", data.id)
    .order("created_at", { ascending: true });
  return NextResponse.json({ request: data, events: events ?? [] });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const body = await request.json();
  const decision = String(body.decision ?? "");
  const note = body.note ? String(body.note).trim() : null;
  const db = admin();
  const { data: current, error: loadError } = await db
    .from("service_requests")
    .select("*, request_categories(slug, needs_fulfilment, is_leave)")
    .eq("id", context.params.id)
    .maybeSingle();
  if (loadError || !current) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const category = Array.isArray(current.request_categories) ? current.request_categories[0] : current.request_categories;
  const isWaiting = current.waiting_on_id === caller.userId;
  const isAssignee = current.assigned_to_id === caller.userId;
  const isRequester = current.requester_id === caller.userId;
  const canReview = REVIEWERS.has(caller.role);
  const patch: Record<string, unknown> = {};
  let nextStatus = current.status;

  if (decision === "cancel") {
    if (!isRequester || ["completed", "rejected", "cancelled"].includes(current.status)) {
      return NextResponse.json({ error: "You cannot cancel this request" }, { status: 403 });
    }
    nextStatus = "cancelled";
    patch.waiting_on_id = null;
  } else if (decision === "needs_information") {
    if (!isWaiting && !canReview) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    nextStatus = "needs_information";
    patch.waiting_on_id = current.requester_id;
    patch.review_note = note;
  } else if (decision === "resubmit") {
    if (!isRequester || current.status !== "needs_information") {
      return NextResponse.json({ error: "This request is not waiting for more information" }, { status: 403 });
    }
    nextStatus = "under_review";
    if (body.answers) patch.answers = body.answers;
  } else if (decision === "reject") {
    if (!isWaiting && !canReview) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    nextStatus = "rejected";
    patch.waiting_on_id = null;
    patch.review_note = note;
    if (current.leave_request_id) {
      await db.from("leave_requests").update({ status: "refused", decision_note: note }).eq("id", current.leave_request_id);
    }
  } else if (decision === "approve") {
    if (!isWaiting && !canReview) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    if (category?.is_leave && current.leave_request_id) {
      const { data: leave } = await db.from("leave_requests").select("id, status").eq("id", current.leave_request_id).maybeSingle();
      if (caller.role === "executive_director" && leave?.status === "pending_executive_director") {
        await db
          .from("leave_requests")
          .update({ status: "pending_director_of_administration", executive_director_id: caller.userId, decision_note: note })
          .eq("id", leave.id);
        const { data: doa } = await db
          .from("profiles")
          .select("id")
          .eq("role", "director_of_administration")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        nextStatus = "under_review";
        patch.waiting_on_id = doa?.id ?? null;
      } else if (
        (caller.role === "director_of_administration" || caller.role === "human_resources") &&
        (leave?.status === "pending_director_of_administration" || leave?.status === "pending_executive_director")
      ) {
        await db
          .from("leave_requests")
          .update({ status: "approved", director_of_administration_id: caller.userId, decision_note: note })
          .eq("id", leave.id);
        nextStatus = "completed";
        patch.waiting_on_id = null;
      } else {
        nextStatus = "completed";
        patch.waiting_on_id = null;
      }
    } else if (category?.needs_fulfilment) {
      nextStatus = "approved";
      patch.assigned_to_id = body.assignedToId || current.assigned_to_id || caller.userId;
      patch.waiting_on_id = patch.assigned_to_id;
    } else {
      nextStatus = "completed";
      patch.waiting_on_id = null;
    }
    patch.review_note = note;
  } else if (decision === "start") {
    if (!isAssignee && !isWaiting && !canReview) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    nextStatus = "in_progress";
    patch.assigned_to_id = current.assigned_to_id || caller.userId;
    patch.waiting_on_id = patch.assigned_to_id;
  } else if (decision === "complete") {
    if (!isAssignee && !isWaiting && !canReview) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    nextStatus = "completed";
    patch.waiting_on_id = null;
    if (current.asset_uuid) {
      await db.from("asset_work_log").insert({
        asset_id: current.asset_uuid,
        request_id: current.id,
        fault: current.answers?.fault || current.title,
        action: note || "Completed from service request",
        cost: Number(body.cost ?? 0),
        parts: body.parts ? String(body.parts) : null,
        performed_by: caller.userId,
        status: "completed"
      });
      await db.from("assets").update({ status: "Operational" }).eq("id", current.asset_uuid);
    }
  } else {
    return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
  }

  patch.status = nextStatus;
  const { data, error } = await db.from("service_requests").update(patch).eq("id", current.id).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await addEvent(db, current.id, caller.userId, current.status, nextStatus, note);
  return NextResponse.json({ request: data });
}
