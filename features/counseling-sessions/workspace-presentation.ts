import type { CampusLeadCoach, CoachCounselor } from "./workspace-queries";

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

export function coachCounselorDetailHref(counselorId: string) {
  return `/workspace/counselors/${counselorId}`;
}

export function coachCounselorRows(counselors: readonly CoachCounselor[]) {
  return counselors.map((counselor) => ({
    id: counselor.id,
    name: counselor.name,
    metadata: `Counselor · ${counselor.campus ?? "Campus not assigned"}`,
    href: coachCounselorDetailHref(counselor.id),
  }));
}
