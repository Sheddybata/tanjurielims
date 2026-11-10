"use client";

import { useState, type ReactNode } from "react";
import {
  ROAD_ACTIVITIES,
  blankLabour,
  blankMaterial,
  blankPhoto,
  blankPlant,
  emptyRoadMonitoring,
  normalizeRoadMonitoring,
  roadMonitoringReportFields,
  type ActivityLine,
  type LabourLine,
  type MaterialLine,
  type PhotoLine,
  type PlantLine,
  type RoadActivityName,
  type RoadMonitoringForm
} from "@/lib/ims/road-monitoring";

type SavedReport = {
  id: string;
  dbId?: string;
  submittedBy: string;
  date: string;
  status: string;
  summary: string;
  roadMonitoring?: RoadMonitoringForm | null;
};

const STEPS = [
  { id: 1, label: "Road" },
  { id: 2, label: "Work" },
  { id: 3, label: "People & plant" },
  { id: 4, label: "Materials" },
  { id: 5, label: "Close" }
] as const;

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="form-control" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        className="form-control min-h-24 resize-y"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function activityTouched(line: ActivityLine) {
  return Boolean(line.target || line.actual || line.cumulative || line.balance || line.remarks);
}

export function RoadMonitoringView({ form }: { form: RoadMonitoringForm }) {
  const activities = ROAD_ACTIVITIES.filter((name) => activityTouched(form.activities[name]));
  const labour = form.labour.filter((row) => row.category || row.deployed || row.planned);
  const plant = form.plant.filter((row) => row.type || row.deployed || row.hours || row.dieselConsumed);
  const materials = form.materials.filter((row) => row.type || row.used || row.received);
  const issues = form.issues.filter((row) => row.challenge || row.action);
  const photos = form.photos.filter((row) => row.location || row.description);

  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">1. Road details</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="Project" value={form.project} />
          <Fact label="Road name / ID" value={form.roadName} />
          <Fact label="Report date" value={form.reportDate} />
          <Fact label="Reporting period" value={form.period} />
          <Fact label="Approved road length" value={form.approvedLength} />
          <Fact label="Section / chainage" value={form.chainage} />
          <Fact label="Weather" value={form.weather} />
          <Fact label="Prepared by" value={form.preparedBy} />
        </dl>
      </section>

      <section>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">2. Daily work progress</p>
        {activities.length ? (
          <div className="mt-3 space-y-3">
            {activities.map((name) => {
              const line = form.activities[name];
              const number = String(ROAD_ACTIVITIES.indexOf(name) + 1).padStart(2, "0");
              return (
                <article key={name} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-950">
                    {number}. {name}
                  </p>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Fact label="Daily target quantity / unit" value={line.target} />
                    <Fact label="Actual achieved today" value={line.actual} />
                    <Fact label="Cumulative completed to date" value={line.cumulative} />
                    <Fact label="Balance remaining" value={line.balance} />
                    <Fact label="Reason for shortfall / remarks" value={line.remarks} />
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-slate-500">No quantities were entered.</p>
        )}
      </section>

      <LineList title="3. Labour deployment" rows={labour.map((row) => row.category || "Labour")} empty="No labour recorded for this road.">
        {labour.map((row, index) => (
          <dl key={index} className="grid gap-3 sm:grid-cols-2">
            <Fact label="Labour category / trade" value={row.category} />
            <Fact label="Number planned / target" value={row.planned} />
            <Fact label="Number deployed" value={row.deployed} />
            <Fact label="Work output / remarks" value={row.output} />
            <Fact label="Attendance / productivity issue" value={row.attendance} />
          </dl>
        ))}
      </LineList>

      <LineList title="4. Equipment deployment" rows={plant.map((row) => row.type || "Plant")} empty="No plant recorded for this road.">
        {plant.map((row, index) => (
          <dl key={index} className="grid gap-3 sm:grid-cols-2">
            <Fact label="Equipment type / ID" value={row.type} />
            <Fact label="Number required / target" value={row.required} />
            <Fact label="Number deployed / operational" value={row.deployed} />
            <Fact label="Operating hours" value={row.hours} />
            <Fact label="Trips / output" value={row.trips} />
            <Fact label="Downtime / breakdown and cause" value={row.downtime} />
            <Fact label="Diesel allocated (litres)" value={row.dieselAllocated} />
            <Fact label="Diesel consumed (litres)" value={row.dieselConsumed} />
          </dl>
        ))}
      </LineList>

      <LineList title="5. Materials" rows={materials.map((row) => row.type || "Material")} empty="No materials recorded for this road.">
        {materials.map((row, index) => (
          <dl key={index} className="grid gap-3 sm:grid-cols-2">
            <Fact label="Material type" value={row.type} />
            <Fact label="Required quantity / target" value={row.required} />
            <Fact label="Opening stock" value={row.opening} />
            <Fact label="Quantity received today" value={row.received} />
            <Fact label="Quantity used today" value={row.used} />
            <Fact label="Closing stock / balance" value={row.closing} />
            <Fact label="Material shortage / remarks" value={row.shortage} />
          </dl>
        ))}
      </LineList>

      <section className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">6. Quality and safety</p>
        <dl className="mt-3 grid gap-3">
          <Fact label="Inspections / tests carried out" value={form.inspections} />
          <Fact label="Quality issues / corrective action" value={form.qualityIssues} />
          <Fact label="Safety observations / incidents" value={form.safety} />
          <Fact label="Action required / responsible person" value={form.safetyAction} />
        </dl>
      </section>

      <LineList
        title="7. Challenges and corrective actions"
        rows={issues.map((_, index) => `Issue ${index + 1}`)}
        empty="No challenge recorded."
      >
        {issues.map((row, index) => (
          <dl key={index} className="grid gap-3">
            <Fact label="Challenge / constraint" value={row.challenge} />
            <Fact label="Effect on daily target" value={row.effect} />
            <Fact label="Corrective / recovery action" value={row.action} />
            <Fact label="Responsible person / deadline" value={row.owner} />
          </dl>
        ))}
      </LineList>

      <section className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">8. Daily summary and next plan</p>
        <dl className="mt-3 grid gap-3">
          <Fact label="Work achieved today" value={form.achieved} />
          <Fact label="Targets not achieved and recovery plan" value={form.recovery} />
          <Fact label="Planned activities for next working day" value={form.nextPlan} />
        </dl>
      </section>

      <LineList title="9. Photo record" rows={photos.map((row) => row.location || "Photo")} empty="No photo note recorded.">
        {photos.map((row, index) => (
          <dl key={index} className="grid gap-3">
            <Fact label={`Photo ${index + 1}: location / chainage`} value={row.location} />
            <Fact label="Description / date" value={row.description} />
          </dl>
        ))}
      </LineList>

      <section className="rounded-2xl border border-slate-200 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">10. Review and sign-off</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Fact label="Prepared by / Monitoring Officer" value={form.preparedBy} />
          <Fact label="Signature / date" value={[form.preparedSign, form.preparedDate].filter(Boolean).join(" · ")} />
          <Fact label="Reviewed by / Project Manager" value={form.reviewedBy} />
          <Fact label="Signature / date" value={[form.reviewedSign, form.reviewedDate].filter(Boolean).join(" · ")} />
          <Fact label="Management remark" value={form.managementRemark} />
        </dl>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-900">{value}</dd>
    </div>
  );
}

function LineList({
  title,
  rows,
  empty,
  children
}: {
  title: string;
  rows: string[];
  empty: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">{title}</p>
      {rows.length ? <div className="mt-3 space-y-3">{wrapCards(children)}</div> : <p className="mt-2 text-slate-500">{empty}</p>}
    </section>
  );
}

function wrapCards(children: ReactNode) {
  const list = Array.isArray(children) ? children : [children];
  return list.map((child, index) => (
    <article key={index} className="rounded-2xl border border-slate-200 p-4">
      {child}
    </article>
  ));
}

export function RoadMonitoringForm({
  preparedBy,
  reports,
  onSubmit,
  onOpenReport
}: {
  preparedBy: string;
  reports: SavedReport[];
  onSubmit: (submission: {
    id: string;
    date: string;
    status: "Draft" | "Pending Chairman Review";
    priority: "Normal" | "Attention" | "Critical";
    revenue: number;
    inquiries: number;
    attendance: number;
    activeOperations: number;
    cashIn: number;
    expenses: number;
    assetsFlagged: number;
    jobsCompleted?: string;
    jobsInProgress?: string;
    equipmentStatus?: string[];
    departmentUpdate?: string;
    currentProjects?: string;
    upcomingProjects?: string;
    growthIdeas?: string;
    challenges?: string;
    summary: string;
    parentReportId?: string | null;
  }) => Promise<unknown>;
  onOpenReport?: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => emptyRoadMonitoring(preparedBy, today));
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resumeLabel, setResumeLabel] = useState("");
  const [parentReportId, setParentReportId] = useState<string | null>(null);
  const [sent, setSent] = useState("");

  const mine = reports.filter((item) => item.submittedBy === preparedBy && item.roadMonitoring);
  const todayDraft = mine.find((item) => item.date === today && item.status === "Draft");
  const todayPending = mine.find((item) => item.date === today && item.status === "Pending Chairman Review");
  const todayReturned = mine.find((item) => item.date === today && item.status === "Returned");

  function load(report: SavedReport, mode: "draft" | "returned") {
    const next = normalizeRoadMonitoring(report.roadMonitoring, emptyRoadMonitoring(preparedBy, report.date));
    if (!next) return;
    setForm(next);
    setParentReportId(mode === "returned" ? report.dbId || null : null);
    setResumeLabel(mode === "returned" ? `Fixing the returned form for ${report.date}` : `Continuing the draft for ${report.date}`);
    setError("");
    setSent("");
    setStep(1);
  }

  function updateActivity(name: RoadActivityName, patch: Partial<ActivityLine>) {
    setForm((current) => ({
      ...current,
      activities: { ...current.activities, [name]: { ...current.activities[name], ...patch } }
    }));
  }

  function updateRow<T>(key: "labour" | "plant" | "materials" | "photos", index: number, patch: Partial<T>) {
    setForm((current) => {
      const rows = [...(current[key] as T[])];
      rows[index] = { ...rows[index], ...patch };
      return { ...current, [key]: rows };
    });
  }

  async function save(status: "Draft" | "Pending Chairman Review") {
    setError("");
    setSent("");
    if (status === "Pending Chairman Review") {
      const missing = [
        !form.roadName.trim() && "Road name / ID",
        !form.reportDate.trim() && "Report date",
        !form.achieved.trim() && "Work achieved today"
      ].filter(Boolean);
      if (missing.length) {
        setStep(!form.roadName.trim() || !form.reportDate.trim() ? 1 : 5);
        setError(`Complete this before you send it: ${missing.join(", ")}.`);
        return;
      }
    }
    const packed = roadMonitoringReportFields(form);
    const hasIssue =
      form.issues.some((issue) => issue.challenge.trim()) ||
      ROAD_ACTIVITIES.some((name) => form.activities[name].remarks.trim());
    setSaving(true);
    try {
      await onSubmit({
        id: `IMS-${today.replace(/-/g, "")}-${Date.now().toString().slice(-6)}`,
        date: form.reportDate || today,
        status,
        priority: hasIssue ? "Attention" : "Normal",
        revenue: 0,
        inquiries: 0,
        attendance: packed.attendance,
        activeOperations: packed.activeOperations,
        cashIn: 0,
        expenses: 0,
        assetsFlagged: 0,
        jobsCompleted: packed.jobsCompleted,
        jobsInProgress: packed.jobsInProgress,
        equipmentStatus: packed.equipmentStatus,
        departmentUpdate: packed.departmentUpdate,
        currentProjects: packed.currentProjects,
        upcomingProjects: packed.upcomingProjects,
        growthIdeas: packed.growthIdeas,
        challenges: packed.challenges,
        summary: packed.summary,
        parentReportId
      });
      setForm(emptyRoadMonitoring(preparedBy, today));
      setParentReportId(null);
      setResumeLabel("");
      setStep(1);
      setSent(status === "Draft" ? "Draft saved. It is with your reports." : "Sent to the Executive Director.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this form");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 pb-28 lg:pb-0">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-800">Per road monitoring</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-950">File today’s road report</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          One form covers one road only. Record the labour, plant, fuel, and materials that belong to that road. Do not
          copy the same shared resources onto another road’s form.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
        {todayPending ? (
          <p className="font-medium text-blue-800">
            Today’s road form is already with the Executive Director.
            {onOpenReport ? (
              <button type="button" className="ml-2 font-semibold underline" onClick={() => onOpenReport(todayPending.id)}>
                Open it
              </button>
            ) : null}
          </p>
        ) : todayReturned ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-amber-900">Today’s form was returned. Load it, correct it, and send it again.</p>
            <button type="button" className="primary-button" onClick={() => load(todayReturned, "returned")}>
              Fix and resubmit
            </button>
          </div>
        ) : todayDraft ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-medium text-slate-700">You have a draft for today.</p>
            <button type="button" className="secondary-button" onClick={() => load(todayDraft, "draft")}>
              Continue draft
            </button>
          </div>
        ) : (
          <p className="font-medium text-slate-600">No road form for today yet. Start with the road name.</p>
        )}
      </div>

      {resumeLabel ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900">
          {resumeLabel}
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => {
              setForm(emptyRoadMonitoring(preparedBy, today));
              setParentReportId(null);
              setResumeLabel("");
              setStep(1);
            }}
          >
            Start fresh
          </button>
        </div>
      ) : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {sent ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sent}</p> : null}

      <div className="grid grid-cols-5 gap-1">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStep(item.id)}
            className={`min-h-11 rounded-xl border px-1 py-2 text-[11px] font-semibold leading-tight sm:text-xs ${
              step === item.id
                ? "border-blue-700 bg-blue-700 text-white"
                : step > item.id
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-500"
            }`}
          >
            {item.id}. {item.label}
          </button>
        ))}
      </div>

      {step === 1 && (
        <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
          <h4 className="font-semibold text-slate-950">1. Road details</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" value={form.project} onChange={(project) => setForm({ ...form, project })} placeholder="Jalingo Township Road" />
            <Field label="Road name / ID *" value={form.roadName} onChange={(roadName) => setForm({ ...form, roadName })} />
            <Field label="Report date *" value={form.reportDate} onChange={(reportDate) => setForm({ ...form, reportDate })} placeholder="YYYY-MM-DD" />
            <Field label="Reporting period" value={form.period} onChange={(period) => setForm({ ...form, period })} placeholder="Daily" />
            <Field label="Approved road length" value={form.approvedLength} onChange={(approvedLength) => setForm({ ...form, approvedLength })} />
            <Field label="Section / chainage" value={form.chainage} onChange={(chainage) => setForm({ ...form, chainage })} />
            <Field label="Weather" value={form.weather} onChange={(weather) => setForm({ ...form, weather })} />
            <Field label="Prepared by" value={form.preparedBy} onChange={(name) => setForm({ ...form, preparedBy: name })} />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h4 className="font-semibold text-slate-950">2. Daily work progress</h4>
          <p className="text-sm text-slate-600">
            Enter the target and what was actually done. Use the unit that fits the activity, such as m, m², m³, tonnes, or number.
            Leave an activity blank if this road did not touch it today.
          </p>
          {ROAD_ACTIVITIES.map((name, index) => {
            const line = form.activities[name];
            return (
              <details key={name} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <summary className="cursor-pointer font-semibold text-slate-950">
                  {String(index + 1).padStart(2, "0")}. {name}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Daily target quantity / unit" value={line.target} onChange={(target) => updateActivity(name, { target })} />
                  <Field label="Actual achieved today" value={line.actual} onChange={(actual) => updateActivity(name, { actual })} />
                  <Field label="Cumulative completed to date" value={line.cumulative} onChange={(cumulative) => updateActivity(name, { cumulative })} />
                  <Field label="Balance remaining" value={line.balance} onChange={(balance) => updateActivity(name, { balance })} />
                  <div className="sm:col-span-2">
                    <Area label="Reason for shortfall / remarks" value={line.remarks} onChange={(remarks) => updateActivity(name, { remarks })} />
                  </div>
                </div>
              </details>
            );
          })}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h4 className="font-semibold text-slate-950">3. Labour deployment</h4>
          {form.labour.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <Field label="Labour category / trade" value={row.category} onChange={(category) => updateRow<LabourLine>("labour", index, { category })} />
              <Field label="Number planned / target" value={row.planned} onChange={(planned) => updateRow<LabourLine>("labour", index, { planned })} />
              <Field label="Number deployed" value={row.deployed} onChange={(deployed) => updateRow<LabourLine>("labour", index, { deployed })} />
              <Area label="Work output / remarks" value={row.output} onChange={(output) => updateRow<LabourLine>("labour", index, { output })} />
              <div className="sm:col-span-2">
                <Area
                  label="Attendance / productivity issue"
                  value={row.attendance}
                  onChange={(attendance) => updateRow<LabourLine>("labour", index, { attendance })}
                />
              </div>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ ...form, labour: [...form.labour, blankLabour()] })}>
            Add a trade
          </button>

          <h4 className="pt-2 font-semibold text-slate-950">4. Equipment deployment</h4>
          {form.plant.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <Field label="Equipment type / ID" value={row.type} onChange={(type) => updateRow<PlantLine>("plant", index, { type })} />
              <Field label="Number required / target" value={row.required} onChange={(required) => updateRow<PlantLine>("plant", index, { required })} />
              <Field label="Number deployed / operational" value={row.deployed} onChange={(deployed) => updateRow<PlantLine>("plant", index, { deployed })} />
              <Field label="Operating hours" value={row.hours} onChange={(hours) => updateRow<PlantLine>("plant", index, { hours })} />
              <Field label="Trips / output where applicable" value={row.trips} onChange={(trips) => updateRow<PlantLine>("plant", index, { trips })} />
              <Field label="Diesel allocated (litres)" value={row.dieselAllocated} onChange={(dieselAllocated) => updateRow<PlantLine>("plant", index, { dieselAllocated })} />
              <Field label="Diesel consumed (litres)" value={row.dieselConsumed} onChange={(dieselConsumed) => updateRow<PlantLine>("plant", index, { dieselConsumed })} />
              <div className="sm:col-span-2">
                <Area label="Downtime / breakdown and cause" value={row.downtime} onChange={(downtime) => updateRow<PlantLine>("plant", index, { downtime })} />
              </div>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ ...form, plant: [...form.plant, blankPlant()] })}>
            Add plant
          </button>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <h4 className="font-semibold text-slate-950">5. Materials</h4>
          {form.materials.map((row, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
              <Field label="Material type" value={row.type} onChange={(type) => updateRow<MaterialLine>("materials", index, { type })} />
              <Field label="Required quantity / target" value={row.required} onChange={(required) => updateRow<MaterialLine>("materials", index, { required })} />
              <Field label="Opening stock" value={row.opening} onChange={(opening) => updateRow<MaterialLine>("materials", index, { opening })} />
              <Field label="Quantity received today" value={row.received} onChange={(received) => updateRow<MaterialLine>("materials", index, { received })} />
              <Field label="Quantity used today" value={row.used} onChange={(used) => updateRow<MaterialLine>("materials", index, { used })} />
              <Field label="Closing stock / balance" value={row.closing} onChange={(closing) => updateRow<MaterialLine>("materials", index, { closing })} />
              <div className="sm:col-span-2">
                <Area label="Material shortage / remarks" value={row.shortage} onChange={(shortage) => updateRow<MaterialLine>("materials", index, { shortage })} />
              </div>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ ...form, materials: [...form.materials, blankMaterial()] })}>
            Add a material
          </button>
        </section>
      )}

      {step === 5 && (
        <section className="space-y-4">
          <h4 className="font-semibold text-slate-950">6. Quality and safety</h4>
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Area label="Inspections / tests carried out" value={form.inspections} onChange={(inspections) => setForm({ ...form, inspections })} />
            <Area label="Quality issues / corrective action" value={form.qualityIssues} onChange={(qualityIssues) => setForm({ ...form, qualityIssues })} />
            <Area label="Safety observations / incidents" value={form.safety} onChange={(safety) => setForm({ ...form, safety })} />
            <Area label="Action required / responsible person" value={form.safetyAction} onChange={(safetyAction) => setForm({ ...form, safetyAction })} />
          </div>

          <h4 className="font-semibold text-slate-950">7. Challenges and corrective actions</h4>
          {form.issues.map((row, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Issue {index + 1}</p>
              <Area label="Challenge / constraint" value={row.challenge} onChange={(challenge) => {
                const issues = [...form.issues];
                issues[index] = { ...row, challenge };
                setForm({ ...form, issues });
              }} />
              <Area label="Effect on daily target" value={row.effect} onChange={(effect) => {
                const issues = [...form.issues];
                issues[index] = { ...row, effect };
                setForm({ ...form, issues });
              }} />
              <Area label="Corrective / recovery action" value={row.action} onChange={(action) => {
                const issues = [...form.issues];
                issues[index] = { ...row, action };
                setForm({ ...form, issues });
              }} />
              <Field label="Responsible person / deadline" value={row.owner} onChange={(owner) => {
                const issues = [...form.issues];
                issues[index] = { ...row, owner };
                setForm({ ...form, issues });
              }} />
            </div>
          ))}

          <h4 className="font-semibold text-slate-950">8. Daily summary and next plan</h4>
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Area label="Work achieved today *" value={form.achieved} onChange={(achieved) => setForm({ ...form, achieved })} />
            <Area label="Targets not achieved and recovery plan" value={form.recovery} onChange={(recovery) => setForm({ ...form, recovery })} />
            <Area label="Planned activities for next working day" value={form.nextPlan} onChange={(nextPlan) => setForm({ ...form, nextPlan })} />
          </div>

          <h4 className="font-semibold text-slate-950">9. Photo record</h4>
          {form.photos.map((row, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <Field label={`Photo ${index + 1}: location / chainage`} value={row.location} onChange={(location) => updateRow<PhotoLine>("photos", index, { location })} />
              <Area label="Description / date" value={row.description} onChange={(description) => updateRow<PhotoLine>("photos", index, { description })} />
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ ...form, photos: [...form.photos, blankPhoto()] })}>
            Add a photo note
          </button>

          <h4 className="font-semibold text-slate-950">10. Review and sign-off</h4>
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
            <Field label="Prepared by / Monitoring Officer" value={form.preparedBy} onChange={(name) => setForm({ ...form, preparedBy: name })} />
            <Field label="Signature" value={form.preparedSign} onChange={(preparedSign) => setForm({ ...form, preparedSign })} />
            <Field label="Prepared date" value={form.preparedDate} onChange={(preparedDate) => setForm({ ...form, preparedDate })} />
            <Field label="Reviewed by / Project Manager" value={form.reviewedBy} onChange={(reviewedBy) => setForm({ ...form, reviewedBy })} />
            <Field label="Project Manager signature" value={form.reviewedSign} onChange={(reviewedSign) => setForm({ ...form, reviewedSign })} />
            <Field label="Review date" value={form.reviewedDate} onChange={(reviewedDate) => setForm({ ...form, reviewedDate })} />
            <div className="sm:col-span-2">
              <Area label="Management remark" value={form.managementRemark} onChange={(managementRemark) => setForm({ ...form, managementRemark })} />
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {step > 1 ? (
          <button type="button" className="secondary-button" onClick={() => setStep((current) => current - 1)}>
            Back
          </button>
        ) : null}
        {step < 5 ? (
          <button type="button" className="primary-button" onClick={() => setStep((current) => current + 1)}>
            Next
          </button>
        ) : null}
        <button type="button" className="secondary-button" disabled={saving} onClick={() => void save("Draft")}>
          Save draft
        </button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void save("Pending Chairman Review")}>
          {saving ? "Sending…" : "Send to Executive Director"}
        </button>
      </div>
    </div>
  );
}
