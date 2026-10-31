import { NextRequest, NextResponse } from "next/server";
import { isCaller, requireCaller } from "@/lib/ims/require-user";
import { admin, resolveCallerScope } from "@/lib/ims/service-server";
import { isConstructionDepartment, isMissingTableError } from "@/lib/ims/service";
import { matchAttendanceStaff, parseAttendanceFile, suggestAttendanceStaff, type AttendanceStaff } from "@/lib/ims/attendance-file";

const WRITE_ROLES = new Set(["manager", "department_head", "executive_director", "director_of_administration", "general_manager", "chairman"]);

async function constructionDepartment(db: ReturnType<typeof admin>, departmentId: string) {
  const { data } = await db
    .from("departments")
    .select("id, name, code, subsidiary_id")
    .eq("id", departmentId)
    .maybeSingle();
  return {
    department: data,
    allowed: isConstructionDepartment({ code: data?.code, name: data?.name })
  };
}

function titleName(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^pm$/i.test(raw)) return "PM";
  return raw.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

async function constructionStaff(db: ReturnType<typeof admin>, departmentId: string): Promise<AttendanceStaff[]> {
  const { data } = await db
    .from("staff")
    .select("id, full_name, preferred_name, staff_number, job_title")
    .eq("department_id", departmentId)
    .not("status", "in", "(resigned,retired,dismissed)");
  return (data ?? []) as AttendanceStaff[];
}

async function loadPinMap(db: ReturnType<typeof admin>, departmentId: string) {
  const { data, error } = await db.from("attendance_pin_map").select("device_pin, staff_id").eq("department_id", departmentId);
  if (error) return { map: new Map<string, string>(), available: false };
  return {
    map: new Map((data ?? []).map((row: { device_pin: string; staff_id: string }) => [row.device_pin, row.staff_id])),
    available: true
  };
}

async function rematchDepartment(
  db: ReturnType<typeof admin>,
  departmentId: string,
  staff: AttendanceStaff[],
  pinMap: Map<string, string>,
  pinMapAvailable: boolean
) {
  const { data, error } = await db
    .from("attendance_punches")
    .select("device_pin, person_name, staff_id")
    .eq("department_id", departmentId);
  if (error) return;
  const seen = new Map<string, { pin: string; name: string | null; staffId: string | null }>();
  for (const row of data ?? []) {
    if (!seen.has(row.device_pin)) {
      seen.set(row.device_pin, { pin: row.device_pin, name: row.person_name, staffId: row.staff_id });
    }
  }
  await Promise.all(
    [...seen.values()].map(async (row) => {
      const staffId = matchAttendanceStaff(staff, row.pin, row.name, pinMap);
      if (!staffId || staffId === row.staffId) return;
      await db.from("attendance_punches").update({ staff_id: staffId }).eq("department_id", departmentId).eq("device_pin", row.pin);
      if (staffId && pinMapAvailable) {
        pinMap.set(row.pin, staffId);
        await db.from("attendance_pin_map").upsert(
          { department_id: departmentId, device_pin: row.pin, staff_id: staffId, person_name: row.name },
          { onConflict: "department_id,device_pin" }
        );
      }
    })
  );
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

  const { department, allowed } = await constructionDepartment(db, departmentId);
  if (!allowed) return NextResponse.json({ error: "Attendance upload is only for Construction" }, { status: 400 });
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (subsidiaryId && department?.subsidiary_id && department.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only see attendance in your subsidiary" }, { status: 403 });
    }
  }

  const staff = await constructionStaff(db, departmentId);
  const { map: pinMap, available: pinMapAvailable } = await loadPinMap(db, departmentId);
  await rematchDepartment(db, departmentId, staff, pinMap, pinMapAvailable);

  const { data: history, error: historyError } = await db
    .from("attendance_punches")
    .select("id, import_id, staff_id, device_pin, person_name, punched_at, punch_type, staff(full_name, staff_number, job_title)")
    .eq("department_id", departmentId)
    .order("punched_at");
  if (historyError) {
    if (isMissingTableError(historyError)) {
      return NextResponse.json({ needsMigration: true, punches: [], roll: [], unmatched: [], days: [], imports: [], date: request.nextUrl.searchParams.get("date") });
    }
    return NextResponse.json({ error: historyError.message }, { status: 400 });
  }

  const allPunches = history ?? [];
  const dayMap = new Map<string, { date: string; people: Set<string>; present: number }>();
  for (const row of allPunches) {
    const day = String(row.punched_at).slice(0, 10);
    const bucket = dayMap.get(day) ?? { date: day, people: new Set<string>(), present: 0 };
    const key = row.staff_id || `pin:${row.device_pin}`;
    if (!bucket.people.has(key)) {
      bucket.people.add(key);
      if (row.staff_id) bucket.present += 1;
    }
    dayMap.set(day, bucket);
  }
  const days = [...dayMap.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((item) => ({ date: item.date, people: item.people.size, present: item.present }));

  const latestDate = days[0]?.date || new Date().toISOString().slice(0, 10);
  const date = request.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const importId = request.nextUrl.searchParams.get("importId") || "";

  let { data: importRows } = await db
    .from("attendance_imports")
    .select("id, file_name, created_at, row_count, matched_count, uploaded_by, profiles:uploaded_by(full_name)")
    .eq("department_id", departmentId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!importRows) {
    const retry = await db
      .from("attendance_imports")
      .select("id, file_name, created_at, row_count, matched_count, uploaded_by")
      .eq("department_id", departmentId)
      .order("created_at", { ascending: false })
      .limit(40);
    importRows = retry.data;
  }

  const imports = (importRows ?? []).map((row: any) => {
    const uploader = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const punchDays = [...new Set(allPunches.filter((item) => item.import_id === row.id).map((item) => String(item.punched_at).slice(0, 10)))].sort();
    return {
      id: row.id,
      fileName: row.file_name,
      createdAt: row.created_at,
      rowCount: row.row_count,
      matchedCount: row.matched_count,
      uploadedBy: uploader?.full_name || null,
      firstDay: punchDays[0] || null,
      lastDay: punchDays[punchDays.length - 1] || null,
      days: punchDays.length
    };
  });

  const punches = allPunches
    .filter((row) => String(row.punched_at).slice(0, 10) === date && (!importId || row.import_id === importId))
    .map((row: any) => {
      const person = Array.isArray(row.staff) ? row.staff[0] : row.staff;
      return {
        id: row.id,
        staffId: row.staff_id,
        devicePin: row.device_pin,
        deviceName: titleName(row.person_name) || null,
        name: person?.full_name || titleName(row.person_name) || `PIN ${row.device_pin}`,
        staffNumber: person?.staff_number || null,
        jobTitle: person?.job_title || null,
        punchedAt: row.punched_at,
        punchType: row.punch_type
      };
    });

  const byPerson = new Map<string, typeof punches>();
  for (const punch of punches) {
    const key = punch.staffId || `pin:${punch.devicePin}`;
    const list = byPerson.get(key) ?? [];
    list.push(punch);
    byPerson.set(key, list);
  }
  const roll = [...byPerson.values()]
    .map((list) => {
      const first = list[0];
      const last = list[list.length - 1];
      const matched = Boolean(first.staffId);
      return {
        key: first.staffId || `pin:${first.devicePin}`,
        staffId: first.staffId,
        name: first.name,
        deviceName: first.deviceName,
        staffNumber: first.staffNumber,
        jobTitle: first.jobTitle,
        devicePin: first.devicePin,
        firstIn: list.find((item) => item.punchType !== "out")?.punchedAt ?? first.punchedAt,
        lastOut: last.punchedAt,
        punches: list.length,
        matched,
        times: list.map((item) => ({ at: item.punchedAt, type: item.punchType })),
        suggestions: matched ? [] : suggestAttendanceStaff(staff, first.deviceName || first.name, 4)
      };
    })
    .sort((a, b) => Number(b.matched) - Number(a.matched) || a.name.localeCompare(b.name));

  return NextResponse.json({
    date,
    latestDate,
    punches,
    roll,
    unmatched: roll.filter((item) => !item.matched),
    present: roll.filter((item) => item.matched).length,
    days,
    imports
  });
}

export async function POST(request: NextRequest) {
  const caller = await requireCaller(request);
  if (!isCaller(caller)) return NextResponse.json({ error: caller.error }, { status: caller.status });
  if (!WRITE_ROLES.has(caller.role)) {
    return NextResponse.json({ error: "Not allowed to upload attendance" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 8) {
    return NextResponse.json({ error: "Choose the Excel or TXT file from the F16." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "That file is too large. Upload the Excel or Glog file from the machine." }, { status: 400 });
  }

  const db = admin();
  const fieldRole = caller.role === "manager" || caller.role === "department_head";
  const departmentId = fieldRole ? String(caller.departmentId || "") : String(form.get("departmentId") || caller.departmentId || "");
  if (!departmentId) return NextResponse.json({ error: "departmentId is required" }, { status: 400 });

  const { department, allowed } = await constructionDepartment(db, departmentId);
  if (!allowed) return NextResponse.json({ error: "Attendance upload is only for Construction" }, { status: 400 });
  if (caller.role === "executive_director") {
    const { subsidiaryId } = await resolveCallerScope(caller, db);
    if (subsidiaryId && department?.subsidiary_id && department.subsidiary_id !== subsidiaryId) {
      return NextResponse.json({ error: "You can only upload attendance in your subsidiary" }, { status: 403 });
    }
  }

  const punches = parseAttendanceFile(await file.arrayBuffer(), file.name);
  if (!punches.length) {
    return NextResponse.json(
      { error: "No attendance rows found. Upload the Excel export or the USB Glog TXT from the F16." },
      { status: 400 }
    );
  }

  const staffRows = await constructionStaff(db, departmentId);
  const { map: pinMap, available: pinMapAvailable } = await loadPinMap(db, departmentId);

  function matchStaff(pin: string, name?: string) {
    return matchAttendanceStaff(staffRows, pin, name, pinMap);
  }

  const projectId = String(form.get("projectId") || "") || null;
  const { data: imported, error: importError } = await db
    .from("attendance_imports")
    .insert({
      department_id: departmentId,
      project_id: projectId,
      file_name: file.name || "f16-glog.txt",
      source: "usb_f16",
      row_count: punches.length,
      uploaded_by: caller.userId
    })
    .select("id")
    .single();
  if (importError) {
    if (isMissingTableError(importError)) {
      return NextResponse.json(
        { error: "Run supabase/migrations/202610310001_attendance_usb.sql in the Supabase SQL editor, then refresh." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: importError.message }, { status: 400 });
  }

  const payload = punches.map((punch) => ({
    import_id: imported.id,
    department_id: departmentId,
    project_id: projectId,
    staff_id: matchStaff(punch.devicePin, punch.name),
    device_pin: punch.devicePin,
    device_name: "Hippoint F16 · Jalingo",
    person_name: punch.name || null,
    punched_at: punch.punchedAt,
    punch_type: punch.punchType,
    raw_line: punch.raw
  }));

  const { error: punchError } = await db.from("attendance_punches").upsert(payload, {
    onConflict: "department_id,device_pin,punched_at",
    ignoreDuplicates: false
  });
  if (punchError) return NextResponse.json({ error: punchError.message }, { status: 400 });

  await rematchDepartment(db, departmentId, staffRows, pinMap, pinMapAvailable);

  const matched = payload.filter((row) => row.staff_id).length;
  const unmatchedPeople = new Map<string, { devicePin: string; name: string; punches: number; suggestions: ReturnType<typeof suggestAttendanceStaff> }>();
  for (const row of payload) {
    if (row.staff_id) continue;
    const key = row.device_pin;
    const current = unmatchedPeople.get(key) ?? {
      devicePin: row.device_pin,
      name: titleName(row.person_name) || `PIN ${row.device_pin}`,
      punches: 0,
      suggestions: suggestAttendanceStaff(staffRows, row.person_name, 4)
    };
    current.punches += 1;
    unmatchedPeople.set(key, current);
  }
  await db.from("attendance_imports").update({ matched_count: matched, row_count: payload.length }).eq("id", imported.id);

  return NextResponse.json({
    importId: imported.id,
    rows: payload.length,
    matched,
    unmatched: payload.length - matched,
    matchedPeople: new Set(payload.filter((row) => row.staff_id).map((row) => row.device_pin)).size,
    unmatchedPeople: [...unmatchedPeople.values()]
  });
}
