export type CoachCaseAssignment = {
  counseling_case_id: string;
  assigned_group_id: string | null;
  assignment_type: string;
  ended_at: string | null;
};

export type CoachCaseScope = {
  caseIds: string[];
  coupleContactCaseIds: string[];
};

/** Projects only active assignments belonging to the signed-in Coach's active team. */
export function coachCaseScope(
  assignments: readonly CoachCaseAssignment[],
  activeCoachTeamIds: readonly string[],
): CoachCaseScope {
  const activeTeamIds = new Set(activeCoachTeamIds);
  const caseIds = new Set<string>();
  const coupleContactCaseIds = new Set<string>();

  assignments.forEach((assignment) => {
    if (
      assignment.ended_at !== null ||
      !assignment.assigned_group_id ||
      !activeTeamIds.has(assignment.assigned_group_id) ||
      (assignment.assignment_type !== "coach" && assignment.assignment_type !== "counselor")
    ) return;

    caseIds.add(assignment.counseling_case_id);
    // The existing contact RPC authorizes Coach members through the active
    // Counselor-of-record assignment, not the separate Coach assignment.
    if (assignment.assignment_type === "counselor") coupleContactCaseIds.add(assignment.counseling_case_id);
  });

  return { caseIds: [...caseIds], coupleContactCaseIds: [...coupleContactCaseIds] };
}
