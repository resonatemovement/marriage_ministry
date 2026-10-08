import type { CampusLeadCoach } from "./workspace-queries";

export function counselingCoachDetailHref(coachId: string) {
  return `/workspace/coaches/${coachId}`;
}

export function campusLeadCoachRows(coaches: readonly CampusLeadCoach[]) {
  return coaches.map((coach) => ({
    id: coach.id,
    name: coach.name,
    metadata: `Coach · ${coach.campus ?? "Campus not assigned"}`,
    href: counselingCoachDetailHref(coach.id),
  }));
}
