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
