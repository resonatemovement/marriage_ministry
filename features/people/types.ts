import type { CaseStatus } from "@/lib/counseling/domain";

export const peopleFilters = ["all", "inactive", "couples", "coaches", "counselors", "admins", "campus_leads", "authors"] as const;
export type PeopleFilter = (typeof peopleFilters)[number];
export type PeopleRecordType = Exclude<PeopleFilter, "all" | "inactive">;

const peopleFilterRecordType = {
  couples: "couples",
  coaches: "coaches",
  counselors: "counselors",
  admins: "admins",
  campus_leads: "campus_leads",
  authors: "authors",
} as const satisfies Record<PeopleRecordType, PeopleRecordType>;

export function normalizePeopleFilter(value: string | undefined): PeopleFilter {
  return peopleFilters.includes(value as PeopleFilter) ? value as PeopleFilter : "all";
}

export function matchesPeopleFilter(record: Pick<PeopleRecord, "type" | "inactive">, filter: PeopleFilter) {
  if (filter === "inactive") return record.inactive === true;
  if (filter === "all") return !record.inactive;
  return record.type === peopleFilterRecordType[filter];
}

type RoleSource = { profile_roles?: unknown };
type InvitationRoleSource = { intended_role?: unknown };

/** Merges established profile roles with authoritative roles on pending invitations. */
export function groupedRoleNames(members: readonly RoleSource[], invitations: readonly InvitationRoleSource[]) {
  return [...new Set([
    ...members.flatMap((member) => Array.isArray(member.profile_roles) ? member.profile_roles : []).flatMap((role) => typeof role === "object" && role !== null && "role" in role && typeof role.role === "string" ? [role.role] : []),
    ...invitations.flatMap((invitation) => typeof invitation.intended_role === "string" ? [invitation.intended_role] : []),
  ])];
}

type PersonName = { firstName: string | null; lastName: string | null; email?: string | null };
type IntakePersonName = PersonName & { position?: string | null };

export function intakeCoupleDisplayName(people: readonly IntakePersonName[]) {
  const ordered = [...people].sort((left, right) => (left.position === "requester" ? -1 : 0) - (right.position === "requester" ? -1 : 0));
  const names = ordered.map((person) => [person.firstName, person.lastName].filter(Boolean).join(" ").trim()).filter(Boolean);
  return names.length ? names.slice(0, 2).join(" & ") : null;
}

/** Resolves Couple rows from their individual profile/invitation names. */
export function coupleDisplayName(groupName: string | null, profiles: readonly PersonName[], invitations: readonly PersonName[], intakeFallback: string | null = null) {
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
  return intakeFallback || groupName || "Pending Couple invitation";
}

export interface PeopleRecord {
  id: string;
  name: string;
  type: PeopleRecordType;
  roles: string[];
  campus: string | null;
  status: CaseStatus | string | null;
  assignedTo: string | null;
  updatedAt: string;
  searchText: string;
  inactive?: boolean;
}
