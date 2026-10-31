export const CONSTRUCTION_DESKS = [
  { id: "project_manager", label: "Project Manager" },
  { id: "supervisor", label: "Supervisor" },
  { id: "admin", label: "Admin" },
  { id: "finance_procurement", label: "Finance and Procurement" }
] as const;

export type ConstructionDeskId = (typeof CONSTRUCTION_DESKS)[number]["id"];

export function constructionDeskLabel(id?: string | null) {
  return CONSTRUCTION_DESKS.find((item) => item.id === id)?.label ?? "";
}

export function deskFromJobTitle(title?: string | null): ConstructionDeskId | "" {
  const value = String(title ?? "").toLowerCase();
  if (value.includes("project manager")) return "project_manager";
  if (value.includes("supervisor")) return "supervisor";
  if (value.includes("admin")) return "admin";
  if (value.includes("financ") || value.includes("procur")) return "finance_procurement";
  return "";
}
