import type { CaseStatus } from "@/lib/counseling/domain";

export const peopleFilters = ["all", "couples", "coaches", "counselors", "admins", "authors"] as const;
export type PeopleFilter = (typeof peopleFilters)[number];
export type PeopleRecordType = Exclude<PeopleFilter, "all">;

const peopleFilterRecordType = {
  couples: "couples",
  coaches: "coaches",
  counselors: "counselors",
  admins: "admins",
  authors: "authors",
} as const satisfies Record<PeopleRecordType, PeopleRecordType>;

export function normalizePeopleFilter(value: string | undefined): PeopleFilter {
  return peopleFilters.includes(value as PeopleFilter) ? value as PeopleFilter : "all";
}

export function matchesPeopleFilter(record: Pick<PeopleRecord, "type">, filter: PeopleFilter) {
  return filter === "all" || record.type === peopleFilterRecordType[filter];
}

type PersonName = { firstName: string | null; lastName: string | null; email?: string | null };

/** Resolves Couple rows from their individual profile/invitation names. */
export function coupleDisplayName(groupName: string | null, profiles: readonly PersonName[], invitations: readonly PersonName[]) {
  const seen = new Set<string>();
  const names = [...profiles, ...invitations].flatMap((person) => {
    const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
    if (!name) return [];
    const key = person.email?.trim().toLowerCase() || name.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
  if (names.length >= 2) return names.slice(0, 2).join(" & ");
  if (names.length === 1) return names[0];
  if (groupName && !/^pending couple invitation$/i.test(groupName.trim())) return groupName;
  return groupName || "Pending Couple invitation";
}

export interface PeopleRecord {
  id: string;
  name: string;
  type: PeopleRecordType;
  roles: string[];
  campus: string | null;
  counselingStatus: CaseStatus | null;
  assignedTo: string | null;
  updatedAt: string;
  searchText: string;
}
