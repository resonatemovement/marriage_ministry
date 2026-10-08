import type { GroupPeopleDetail } from "./detail-model";

export type AssignedCoupleAssignmentType = "coach" | "counselor";

/** Coach team membership follows operational Coach assignment; other team detail semantics stay unchanged. */
export function assignedCoupleAssignmentType(type: GroupPeopleDetail["type"]): AssignedCoupleAssignmentType | null {
  if (type === "coaches") return "coach";
  if (type === "counselors" || type === "campus_leads") return "counselor";
  return null;
}

export function activeTeamAssignmentCounts(assignments: readonly {
  assigned_group_id: string | null;
  assignment_type: string;
  ended_at: string | null;
}[]) {
  const counts = new Map<string, Partial<Record<AssignedCoupleAssignmentType, number>>>();

  assignments.forEach(({ assigned_group_id: groupId, assignment_type: assignmentType, ended_at: endedAt }) => {
    if (!groupId || endedAt !== null || (assignmentType !== "coach" && assignmentType !== "counselor")) return;
    const groupCounts = counts.get(groupId) ?? {};
    groupCounts[assignmentType] = (groupCounts[assignmentType] ?? 0) + 1;
    counts.set(groupId, groupCounts);
  });

  return counts;
}
