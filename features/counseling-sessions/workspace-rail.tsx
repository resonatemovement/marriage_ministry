"use client";

import { RelationshipCard } from "@/features/people/relationship-card";
import type { CampusLeadCoach } from "./workspace-queries";
import { campusLeadCoachRows } from "./workspace-presentation";

export function CampusLeadCoachesRail({ coaches }: { coaches: CampusLeadCoach[] }) {
  return <RelationshipCard
    title="Coaches"
    rows={campusLeadCoachRows(coaches)}
    empty="No coaches assigned."
    navigationMode="chevron"
  />;
}
