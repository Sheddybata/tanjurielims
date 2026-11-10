export const ROAD_MONITORING_MARK = "[[road-monitoring]]";

export const ROAD_ACTIVITIES = [
  "Excavation",
  "Base preparation",
  "Drainage base casting",
  "Iron reinforcement works",
  "Formworks",
  "Casting of drainage walls",
  "Backfilling",
  "Subbase",
  "Base course",
  "Priming",
  "Asphalt",
  "Road marking"
] as const;

export type RoadActivityName = (typeof ROAD_ACTIVITIES)[number];

export type ActivityLine = {
  target: string;
  actual: string;
  cumulative: string;
  balance: string;
  remarks: string;
};

export type LabourLine = {
  category: string;
  planned: string;
  deployed: string;
  output: string;
  attendance: string;
};

export type PlantLine = {
  type: string;
  required: string;
  deployed: string;
  hours: string;
  trips: string;
  downtime: string;
  dieselAllocated: string;
  dieselConsumed: string;
};

export type MaterialLine = {
  type: string;
  required: string;
  opening: string;
  received: string;
  used: string;
  closing: string;
  shortage: string;
};

export type IssueLine = {
  challenge: string;
  effect: string;
  action: string;
  owner: string;
};

export type PhotoLine = {
  location: string;
  description: string;
};

export type RoadMonitoringForm = {
  version: 1;
  project: string;
  roadName: string;
  reportDate: string;
  period: string;
  approvedLength: string;
  chainage: string;
  weather: string;
  preparedBy: string;
  activities: Record<RoadActivityName, ActivityLine>;
  labour: LabourLine[];
  plant: PlantLine[];
  materials: MaterialLine[];
  inspections: string;
  qualityIssues: string;
  safety: string;
  safetyAction: string;
  issues: IssueLine[];
  achieved: string;
  recovery: string;
  nextPlan: string;
  photos: PhotoLine[];
  preparedSign: string;
  preparedDate: string;
  reviewedBy: string;
  reviewedSign: string;
  reviewedDate: string;
  managementRemark: string;
};

export function blankActivity(): ActivityLine {
  return { target: "", actual: "", cumulative: "", balance: "", remarks: "" };
}

export function blankLabour(): LabourLine {
  return { category: "", planned: "", deployed: "", output: "", attendance: "" };
}

export function blankPlant(): PlantLine {
  return {
    type: "",
    required: "",
    deployed: "",
    hours: "",
    trips: "",
    downtime: "",
    dieselAllocated: "",
    dieselConsumed: ""
  };
}

export function blankMaterial(): MaterialLine {
  return { type: "", required: "", opening: "", received: "", used: "", closing: "", shortage: "" };
}

export function blankIssue(): IssueLine {
  return { challenge: "", effect: "", action: "", owner: "" };
}

export function blankPhoto(): PhotoLine {
  return { location: "", description: "" };
}

export function emptyRoadMonitoring(preparedBy = "", reportDate = ""): RoadMonitoringForm {
  const activities = {} as Record<RoadActivityName, ActivityLine>;
  for (const name of ROAD_ACTIVITIES) activities[name] = blankActivity();
  return {
    version: 1,
    project: "",
    roadName: "",
    reportDate,
    period: "Daily",
    approvedLength: "",
    chainage: "",
    weather: "",
    preparedBy,
    activities,
    labour: [blankLabour()],
    plant: [blankPlant()],
    materials: [blankMaterial(), blankMaterial()],
    inspections: "",
    qualityIssues: "",
    safety: "",
    safetyAction: "",
    issues: [blankIssue(), blankIssue(), blankIssue()],
    achieved: "",
    recovery: "",
    nextPlan: "",
    photos: [blankPhoto(), blankPhoto()],
    preparedSign: preparedBy,
    preparedDate: reportDate,
    reviewedBy: preparedBy,
    reviewedSign: "",
    reviewedDate: reportDate,
    managementRemark: ""
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function normalizeRoadMonitoring(value: unknown, fallback?: RoadMonitoringForm): RoadMonitoringForm | null {
  const raw = asRecord(value);
  if (raw.version !== 1) return null;
  const base = fallback ?? emptyRoadMonitoring();
  const activities = { ...base.activities };
  const incoming = asRecord(raw.activities);
  for (const name of ROAD_ACTIVITIES) {
    const line = asRecord(incoming[name]);
    activities[name] = {
      target: text(line.target),
      actual: text(line.actual),
      cumulative: text(line.cumulative),
      balance: text(line.balance),
      remarks: text(line.remarks)
    };
  }
  const list = <T>(rows: unknown, map: (row: Record<string, unknown>) => T, empty: T) => {
    if (!Array.isArray(rows) || !rows.length) return [empty];
    return rows.map((row) => map(asRecord(row)));
  };
  return {
    version: 1,
    project: text(raw.project),
    roadName: text(raw.roadName),
    reportDate: text(raw.reportDate) || base.reportDate,
    period: text(raw.period) || "Daily",
    approvedLength: text(raw.approvedLength),
    chainage: text(raw.chainage),
    weather: text(raw.weather),
    preparedBy: text(raw.preparedBy),
    activities,
    labour: list(
      raw.labour,
      (row) => ({
        category: text(row.category),
        planned: text(row.planned),
        deployed: text(row.deployed),
        output: text(row.output),
        attendance: text(row.attendance)
      }),
      blankLabour()
    ),
    plant: list(
      raw.plant,
      (row) => ({
        type: text(row.type),
        required: text(row.required),
        deployed: text(row.deployed),
        hours: text(row.hours),
        trips: text(row.trips),
        downtime: text(row.downtime),
        dieselAllocated: text(row.dieselAllocated),
        dieselConsumed: text(row.dieselConsumed)
      }),
      blankPlant()
    ),
    materials: list(
      raw.materials,
      (row) => ({
        type: text(row.type),
        required: text(row.required),
        opening: text(row.opening),
        received: text(row.received),
        used: text(row.used),
        closing: text(row.closing),
        shortage: text(row.shortage)
      }),
      blankMaterial()
    ),
    inspections: text(raw.inspections),
    qualityIssues: text(raw.qualityIssues),
    safety: text(raw.safety),
    safetyAction: text(raw.safetyAction),
    issues: (() => {
      const rows = list(
        raw.issues,
        (row) => ({
          challenge: text(row.challenge),
          effect: text(row.effect),
          action: text(row.action),
          owner: text(row.owner)
        }),
        blankIssue()
      ).slice(0, 3);
      while (rows.length < 3) rows.push(blankIssue());
      return rows;
    })(),
    achieved: text(raw.achieved),
    recovery: text(raw.recovery),
    nextPlan: text(raw.nextPlan),
    photos: list(
      raw.photos,
      (row) => ({ location: text(row.location), description: text(row.description) }),
      blankPhoto()
    ),
    preparedSign: text(raw.preparedSign),
    preparedDate: text(raw.preparedDate),
    reviewedBy: text(raw.reviewedBy),
    reviewedSign: text(raw.reviewedSign),
    reviewedDate: text(raw.reviewedDate),
    managementRemark: text(raw.managementRemark)
  };
}

export function splitRoadMonitoring(summary: string) {
  const index = summary.indexOf(ROAD_MONITORING_MARK);
  if (index < 0) return { text: summary, form: null as RoadMonitoringForm | null };
  const textPart = summary.slice(0, index).trim();
  const raw = summary.slice(index + ROAD_MONITORING_MARK.length).trim();
  try {
    const form = normalizeRoadMonitoring(JSON.parse(raw));
    return { text: textPart || (form ? `Road monitoring · ${form.roadName}` : summary), form };
  } catch {
    return { text: textPart || "Road monitoring report", form: null as RoadMonitoringForm | null };
  }
}

export function roadMonitoringReportFields(form: RoadMonitoringForm) {
  const road = form.roadName.trim();
  const activityLines = ROAD_ACTIVITIES.map((name, index) => {
    const line = form.activities[name];
    if (!line.target.trim() && !line.actual.trim() && !line.cumulative.trim() && !line.balance.trim() && !line.remarks.trim()) {
      return "";
    }
    return `${String(index + 1).padStart(2, "0")}. ${name}: target ${line.target.trim() || "—"}, actual ${line.actual.trim() || "—"}, to date ${line.cumulative.trim() || "—"}, balance ${line.balance.trim() || "—"}${line.remarks.trim() ? `. ${line.remarks.trim()}` : ""}`;
  }).filter(Boolean);
  const issueText = form.issues
    .map((issue, index) =>
      issue.challenge.trim()
        ? `Issue ${index + 1}: ${issue.challenge.trim()}${issue.action.trim() ? ` — ${issue.action.trim()}` : ""}`
        : ""
    )
    .filter(Boolean)
    .join("\n");
  const deployed = form.labour.reduce((sum, row) => sum + (Number(row.deployed) || 0), 0);
  const headline = `Road monitoring · ${road || "Road not named"}${form.chainage.trim() ? ` · ${form.chainage.trim()}` : ""}`;
  const summary = [headline, form.achieved.trim() ? `Today: ${form.achieved.trim()}` : "", "", ROAD_MONITORING_MARK, JSON.stringify(form)].join(
    "\n"
  );
  return {
    jobsCompleted: road || "Road monitoring",
    jobsInProgress: form.chainage.trim(),
    equipmentStatus: form.plant.map((row) => row.type.trim()).filter(Boolean),
    departmentUpdate: form.achieved.trim(),
    currentProjects: activityLines.join("\n") || form.chainage.trim() || road,
    upcomingProjects: form.nextPlan.trim(),
    growthIdeas: form.recovery.trim() || form.qualityIssues.trim() || form.safetyAction.trim(),
    challenges: issueText || form.safety.trim() || "None recorded on this road today.",
    attendance: deployed,
    activeOperations: activityLines.length,
    summary
  };
}
