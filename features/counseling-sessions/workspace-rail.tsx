"use client";

import { RelationshipCard } from "@/features/people/relationship-card";
import type { CampusLeadCoach, CoachCounselor } from "./workspace-queries";
import { campusLeadCoachRows, coachCounselorRows } from "./workspace-presentation";

export function CampusLeadCoachesRail({ coaches }: { coaches: CampusLeadCoach[] }) {
  return <RelationshipCard
    title="Coaches"
    rows={campusLeadCoachRows(coaches)}
    empty="No coaches assigned."
    navigationMode="chevron"
  />;
}

export function CoachCounselorsRail({ counselors }: { counselors: CoachCounselor[] }) {
  return <RelationshipCard
    title="Counselors"
    rows={coachCounselorRows(counselors)}
    empty="No counselors assigned."
    navigationMode="chevron"
  />;
}
