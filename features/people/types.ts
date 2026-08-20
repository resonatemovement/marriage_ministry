import type { CaseStatus } from "@/lib/counseling/domain";

export const peopleFilters = ["all", "couples", "coaches", "counselors", "admins", "authors"] as const;
export type PeopleFilter = (typeof peopleFilters)[number];
export type PeopleRecordType = Exclude<PeopleFilter, "all">;

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
