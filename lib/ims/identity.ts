export type IdentityPerson = {
  id: string;
  full_name: string;
  staff_number?: string | null;
  government_id_type?: string | null;
  government_id_number?: string | null;
  nin?: string | null;
};

export type SharedIdGroup = {
  key: string;
  label: string;
  people: Array<{
    id: string;
    fullName: string;
    staffNumber: string | null;
  }>;
};

export function normalizeGovId(value?: string | null) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!raw || raw === "pending" || raw.startsWith("pending") || raw.startsWith("none")) return null;
  return raw;
}

function displayId(person: IdentityPerson) {
  if (person.nin && normalizeGovId(person.nin)) return `NIN ${person.nin.trim()}`;
  if (person.government_id_number && normalizeGovId(person.government_id_number)) {
    const kind = person.government_id_type ? person.government_id_type.replaceAll("_", " ") : "ID";
    return `${kind} ${person.government_id_number.trim()}`;
  }
  return "ID";
}

export function identityKeys(person: IdentityPerson) {
  const keys = new Set<string>();
  const nin = normalizeGovId(person.nin);
  const gov = normalizeGovId(person.government_id_number);
  if (nin) keys.add(nin);
  if (gov) keys.add(gov);
  return Array.from(keys);
}

export function findSharedGovernmentIds(people: IdentityPerson[]): SharedIdGroup[] {
  const buckets = new Map<string, IdentityPerson[]>();
  for (const person of people) {
    for (const key of identityKeys(person)) {
      const list = buckets.get(key) ?? [];
      list.push(person);
      buckets.set(key, list);
    }
  }

  return Array.from(buckets.entries())
    .map(([key, list]) => {
      const unique = Array.from(new Map(list.map((person: IdentityPerson) => [person.id, person])).values());
      return { key, unique };
    })
    .filter((item) => item.unique.length > 1)
    .map(({ key, unique }) => ({
      key,
      label: displayId(unique[0]),
      people: unique.map((person) => ({
        id: person.id,
        fullName: person.full_name,
        staffNumber: person.staff_number ?? null
      }))
    }));
}

export function matchesIdentity(person: IdentityPerson, other: IdentityPerson) {
  const left = identityKeys(person);
  const right = new Set(identityKeys(other));
  return left.some((key) => right.has(key));
}

export function peopleSharingId(people: IdentityPerson[], candidate: IdentityPerson) {
  return people.filter((person) => person.id !== candidate.id && matchesIdentity(person, candidate));
}

export function describePeople(people: Array<{ full_name?: string; fullName?: string; staff_number?: string | null; staffNumber?: string | null }>) {
  return people
    .map((person) => {
      const name = person.full_name ?? person.fullName ?? "Staff";
      const number = person.staff_number ?? person.staffNumber;
      return number ? `${name} (${number})` : name;
    })
    .join(", ");
}
