"use client";

export type OrgDepartment = {
  id: string;
  name: string;
  code?: string | null;
  subsidiaryId?: string | null;
  subsidiaryName?: string | null;
  subsidiaryCode?: string | null;
};

const subsidiaryOrder = ["HQ", "ADM", "TECH", "EDU", "FRM", "BIF", "CON", "MED", "LEG"];

export function groupBySubsidiary(departments: OrgDepartment[]) {
  const groups = new Map<string, { id: string; name: string; code: string; departments: OrgDepartment[] }>();
  for (const department of departments) {
    if (!department.subsidiaryId || !department.subsidiaryName) continue;
    const current = groups.get(department.subsidiaryId);
    if (current) current.departments.push(department);
    else {
      groups.set(department.subsidiaryId, {
        id: department.subsidiaryId,
        name: department.subsidiaryName,
        code: department.subsidiaryCode ?? "",
        departments: [department]
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => {
    const aIndex = subsidiaryOrder.indexOf(a.code);
    const bIndex = subsidiaryOrder.indexOf(b.code);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

export function SubsidiaryDepartmentFields({
  departments,
  subsidiaryId,
  departmentId,
  onSubsidiaryId,
  onDepartmentId,
  departmentName,
  departmentOptional
}: {
  departments: OrgDepartment[];
  subsidiaryId: string;
  departmentId: string;
  onSubsidiaryId: (id: string) => void;
  onDepartmentId: (id: string) => void;
  departmentName?: string;
  departmentOptional?: boolean;
}) {
  const groups = groupBySubsidiary(departments);
  const selected = groups.find((group) => group.id === subsidiaryId);
  const inner = selected?.departments ?? [];

  if (!groups.length) {
    return (
      <p className="text-sm text-slate-600 md:col-span-2">
        Subsidiaries are not in the database yet. Run supabase/migrations/202610010003_subsidiaries.sql in the Supabase SQL editor, then refresh.
      </p>
    );
  }

  return (
    <>
      <label className="block">
        <span className="field-label">Subsidiary</span>
        <select
          name="subsidiaryId"
          value={subsidiaryId}
          onChange={(event) => {
            onSubsidiaryId(event.target.value);
            onDepartmentId("");
          }}
          className="form-control"
          required
        >
          <option value="">Select subsidiary</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
              {group.code ? ` (${group.code})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="field-label">{departmentName ?? "Department"}</span>
        <select
          name="departmentId"
          value={departmentId}
          onChange={(event) => onDepartmentId(event.target.value)}
          className="form-control"
          required={!departmentOptional}
          disabled={!subsidiaryId}
        >
          <option value="">{subsidiaryId ? (departmentOptional ? "Whole subsidiary" : "Select department") : "Select a subsidiary first"}</option>
          {inner.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
              {department.code ? ` (${department.code})` : ""}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
