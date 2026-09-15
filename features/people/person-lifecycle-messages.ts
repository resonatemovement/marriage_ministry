const teamBlockerMessages: Record<string, string> = {
  intake_request_history: "This team is linked to retained Intake Request history and cannot be permanently deleted.",
  counseling_case_history: "This team has counseling case history and cannot be permanently deleted.",
  counselor_assignment_history: "This team has Counselor-of-record assignment history and cannot be permanently deleted.",
  active_supervision_relationship: "This team has supervision relationship history and cannot be permanently deleted.",
  campus_lead_operational_assignment: "This team has Campus Lead operational assignment history and cannot be permanently deleted.",
  member_in_another_active_team: "A team member belongs to another active team, so this team cannot be permanently deleted.",
  member_ministry_history: "A team member has retained ministry history and cannot be permanently deleted.",
  assessment_documents: "A team member has assessment documents and cannot be permanently deleted.",
  shared_or_non_owned_invitation: "A team member owns invitations outside this team, so this team cannot be permanently deleted.",
};

export function teamDeleteBlockerMessage(error: string, intakeCoupleName: string | null = null) { const code = error.match(/team_delete_blocker:([a-z_]+)/)?.[1]; if (code === "intake_request_history" && intakeCoupleName) return `This Couple is linked to the retained Intake Request for ${intakeCoupleName} and cannot be permanently deleted.`; return code ? teamBlockerMessages[code] ?? "This team has a protected dependency and cannot be permanently deleted." : "This team cannot be permanently deleted because it has retained ministry history or another protected dependency."; }
