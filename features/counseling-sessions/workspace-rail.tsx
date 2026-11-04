"use client";

import { OversightTeamList } from "./oversight-progress";
import type { OversightTeamNode } from "./oversight-rail-queries";

export function CampusLeadCoachesRail({ coaches }: { coaches: OversightTeamNode[] }) {
  return <OversightTeamList title="Coaches" teams={coaches} empty="No coaches assigned." />;
}

export function CoachCounselorsRail({ counselors }: { counselors: OversightTeamNode[] }) {
  return <OversightTeamList title="Counselors" teams={counselors} empty="No counselors assigned." />;
}
