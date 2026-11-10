import type { HqClockPunch, HqClockUser } from "@/lib/ims/hq-clock";

export type HqStaffMatch = {
  id: string;
  fullName: string;
  preferredName?: string | null;
  jobTitle: string;
  place: string;
  photoUrl?: string | null;
};

export type HqRosterPerson = {
  id: string;
  devicePin: string;
  name: string;
  jobTitle: string;
  place: string;
  photoUrl: string | null;
  linked: boolean;
  punches: string[];
};

export function nameKey(value?: string | null) {
  const first = String(value ?? "").replace(/\0/g, "").trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z]/g, "");
}

function nameWords(value?: string | null) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase().replace(/[^a-z]/g, ""))
    .filter((word) => word.length > 2);
}

export function linkClockToStaff(users: HqClockUser[], staff: HqStaffMatch[], punches: HqClockPunch[]): HqRosterPerson[] {
  const staffByName = new Map<string, HqStaffMatch[]>();
  for (const person of staff) {
    const keys = new Set([...nameWords(person.preferredName), ...nameWords(person.fullName)]);
    for (const key of keys) {
      const group = staffByName.get(key) ?? [];
      if (!group.some((item) => item.id === person.id)) group.push(person);
      staffByName.set(key, group);
    }
  }

  const clockByName = new Map<string, HqClockUser[]>();
  for (const user of users) {
    const key = nameKey(user.name);
    const group = clockByName.get(key) ?? [];
    group.push(user);
    clockByName.set(key, group);
  }

  const punchesByPin = new Map<string, string[]>();
  for (const punch of punches) {
    const group = punchesByPin.get(punch.devicePin) ?? [];
    group.push(punch.at);
    punchesByPin.set(punch.devicePin, group);
  }

  return users
    .map((user) => {
      const key = nameKey(user.name);
      const staffHits = key ? staffByName.get(key) ?? [] : [];
      const clockHits = key ? clockByName.get(key) ?? [] : [];
      const unique = staffHits.length === 1 && clockHits.length === 1 ? staffHits[0] : null;
      const times = punchesByPin.get(user.devicePin) ?? [];
      if (unique) {
        return {
          id: unique.id,
          devicePin: user.devicePin,
          name: unique.fullName,
          jobTitle: unique.jobTitle || "Staff",
          place: unique.place,
          photoUrl: unique.photoUrl ?? null,
          linked: true,
          punches: times
        };
      }
      const jobTitle =
        clockHits.length > 1 ? "Same name on the clock more than once" : staffHits.length > 1 ? "More than one staff record has this name" : "Not linked to the register";
      return {
        id: `clock-${user.devicePin}`,
        devicePin: user.devicePin,
        name: user.name || `User ${user.devicePin}`,
        jobTitle,
        place: `Clock number ${user.devicePin}`,
        photoUrl: null,
        linked: false,
        punches: times
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
