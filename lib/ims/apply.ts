export const APPLY_IMS_ROLES = [
  ["chairman", "Chairman"],
  ["managing_director", "Managing Director"],
  ["executive_director", "Executive Director"],
  ["general_manager", "General Manager"],
  ["director_of_administration", "Director of Administration"],
  ["human_resources", "Human Resources"],
  ["manager", "Manager"],
  ["department_head", "Department Head"],
  ["marketing_officer", "Marketing Officer"],
  ["staff", "Staff"]
] as const;

export const APPLY_EMPLOYMENT_TYPES = [
  ["full_time", "Full-time"],
  ["part_time", "Part-time"],
  ["contract", "Contract"],
  ["intern", "Intern"],
  ["nysc", "NYSC"],
  ["consultant", "Consultant"]
] as const;

export const APPLY_EMPLOYMENT_STATUSES = [
  ["permanent", "Active / Permanent"],
  ["probation", "Probation"],
  ["contract", "Contract"],
  ["intern", "Intern"],
  ["nysc", "NYSC"],
  ["consultant", "Consultant"]
] as const;

export const APPLY_ID_TYPES = [
  ["nin_slip", "NIN slip"],
  ["voters_card", "Voter’s card"],
  ["passport", "International passport"],
  ["drivers_licence", "Driver’s licence"],
  ["national_id", "National ID card"]
] as const;

export const APPLY_BIOMETRIC_METHODS = [
  ["fingerprint", "Fingerprint"],
  ["face", "Face"],
  ["both", "Both"]
] as const;

export function generateApplicationReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TAN-APP-${stamp}-${rand}`;
}

export function requiredString(value: FormDataEntryValue | null, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export function optionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}
