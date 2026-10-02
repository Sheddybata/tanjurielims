export type DbRole =
  | "chairman"
  | "managing_director"
  | "executive_director"
  | "general_manager"
  | "director_of_administration"
  | "human_resources"
  | "department_head"
  | "manager"
  | "marketing_officer";
export type DbReportStatus = "draft" | "pending_chairman_review" | "approved" | "returned";
export type DbReportPriority = "normal" | "attention" | "critical";
export type DbMarketingStatus = "new" | "quoted" | "assigned" | "follow_up";

export type UiRole =
  | "chairman"
  | "managing-director"
  | "executive-director"
  | "general-manager"
  | "director-of-administration"
  | "human-resources"
  | "department-head"
  | "manager"
  | "marketing-officer";
export type UiSubmissionStatus = "Draft" | "Pending Chairman Review" | "Approved" | "Returned";
export type UiPriority = "Normal" | "Attention" | "Critical";
export type UiMarketingStatus = "New" | "Quoted" | "Assigned" | "Follow-up";

export const roleToDb: Record<UiRole, DbRole> = {
  chairman: "chairman",
  "managing-director": "managing_director",
  "executive-director": "executive_director",
  "general-manager": "general_manager",
  "director-of-administration": "director_of_administration",
  "human-resources": "human_resources",
  "department-head": "department_head",
  manager: "manager",
  "marketing-officer": "marketing_officer"
};

export const roleFromDb: Record<DbRole, UiRole> = {
  chairman: "chairman",
  managing_director: "managing-director",
  executive_director: "executive-director",
  general_manager: "general-manager",
  director_of_administration: "director-of-administration",
  human_resources: "human-resources",
  department_head: "department-head",
  manager: "manager",
  marketing_officer: "marketing-officer"
};

export const statusToDb: Record<UiSubmissionStatus, DbReportStatus> = {
  Draft: "draft",
  "Pending Chairman Review": "pending_chairman_review",
  Approved: "approved",
  Returned: "returned"
};

export const statusFromDb: Record<DbReportStatus, UiSubmissionStatus> = {
  draft: "Draft",
  pending_chairman_review: "Pending Chairman Review",
  approved: "Approved",
  returned: "Returned"
};

export const priorityToDb: Record<UiPriority, DbReportPriority> = {
  Normal: "normal",
  Attention: "attention",
  Critical: "critical"
};

export const priorityFromDb: Record<DbReportPriority, UiPriority> = {
  normal: "Normal",
  attention: "Attention",
  critical: "Critical"
};

export const marketingStatusToDb: Record<UiMarketingStatus, DbMarketingStatus> = {
  New: "new",
  Quoted: "quoted",
  Assigned: "assigned",
  "Follow-up": "follow_up"
};

export const marketingStatusFromDb: Record<DbMarketingStatus, UiMarketingStatus> = {
  new: "New",
  quoted: "Quoted",
  assigned: "Assigned",
  follow_up: "Follow-up"
};
