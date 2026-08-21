const APP_ROLES = [
  "super_admin",
  "admin",
  "coach",
  "counselor",
  "couple",
  "author",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
const APP_ROLE_SET = new Set<string>(APP_ROLES);

export const CASE_STATUSES = [
  "requested",
  "assessment",
  "interviewed",
  "matched",
  "active",
  "pending_final",
  "finished",
  "referred",
  "inactive",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

const ADMIN_ROLES = new Set<AppRole>(["super_admin", "admin"]);
const MATCHABLE_STATUSES = new Set<CaseStatus>([
  "requested",
  "assessment",
  "interviewed",
]);

const STATUS_TRANSITIONS: Readonly<Record<CaseStatus, readonly CaseStatus[]>> = {
  requested: ["assessment", "referred", "inactive"],
  assessment: ["interviewed", "referred", "inactive"],
  interviewed: ["matched", "referred", "inactive"],
  matched: ["active", "interviewed", "inactive"],
  active: ["pending_final", "referred", "inactive"],
  pending_final: ["active", "finished", "inactive"],
  finished: ["active"],
  referred: ["assessment", "inactive"],
  inactive: ["requested"],
};

export function isAppRole(value: string): value is AppRole {
  return APP_ROLE_SET.has(value);
}

function hasAdministrativeAccess(roles: readonly AppRole[]) {
  return roles.some((role) => ADMIN_ROLES.has(role));
}

export function canTransitionCase(
  from: CaseStatus,
  to: CaseStatus,
  hasActiveAssignment: boolean,
) {
  if (to === "matched" && !hasActiveAssignment) return false;
  return STATUS_TRANSITIONS[from].includes(to);
}

export function statusAfterAssignment(status: CaseStatus): CaseStatus {
  return MATCHABLE_STATUSES.has(status) ? "matched" : status;
}

export function canManageAssignments(roles: readonly AppRole[]) {
  return hasAdministrativeAccess(roles);
}
