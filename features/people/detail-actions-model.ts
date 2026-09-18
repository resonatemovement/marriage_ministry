import type { PeopleDetail } from "./detail-model";
import { getOnboardingRequirements } from "@/features/onboarding/requirements";

export type TeamType = "coach" | "counselor" | "campus_lead";
export type PeopleDetailAction = "edit" | "assign-team" | "reassign-team" | "unassign-team" | "assign-coach" | "reassign-coach" | "assign-counselor" | "assign-campus-lead-coach";

export interface TeamOption {
  id: string;
  name: string;
  campus: string | null;
  type: TeamType;
  active?: boolean;
  campusId?: string | null;
}

export interface CampusOption {
  id: string;
  name: string;
  active: boolean;
}

export interface PeopleDetailActionContext {
  mode: "admin" | "campus_lead";
  selfTarget: TeamOption | null;
  campusLeadTargets: TeamOption[];
  eligibleCouples: { id: string; name: string }[];
  campuses: CampusOption[];
  counselorTeams: TeamOption[];
  coachTeams: TeamOption[];
  eligibleCounselingTeams: TeamOption[];
  campusLeadCoachTeams: TeamOption[];
  currentCounselorTeam: TeamOption | null;
  currentCoachTeam: TeamOption | null;
  currentCounselorTeams: TeamOption[];
  currentCampusLeadCoaches: TeamOption[];
  currentCoupleTeam: TeamOption | null;
  currentCoupleAssignmentType: TeamType | null;
  coupleCampusId: string | null;
  coupleAssignmentReady: boolean;
}

type ReadinessProfile = { status?: string | null; onboarding_completed_at?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; campus_id?: string | null; phone?: string | null; photo_path?: string | null };
function profileReady(profile: ReadinessProfile | null | undefined, requireTimestamp: boolean) {
  if (!profile) return false;
  const hasCanonicalFields = ["first_name", "last_name", "email", "campus_id", "phone", "photo_path"].some((key) => key in profile);
  const complete = hasCanonicalFields ? getOnboardingRequirements({ firstName: profile.first_name, lastName: profile.last_name, email: profile.email, campusId: profile.campus_id, phone: profile.phone, photoPath: profile.photo_path }).complete : true;
  return profile.status === "active" && complete && (!requireTimestamp || Boolean(profile.onboarding_completed_at));
}

export function isOperationalTeamReady(members: Array<{ ended_at?: string | null; profile?: ReadinessProfile | null }>, invitationStatuses: string[] = []) {
  const activeMembers = members.filter((member) => member.ended_at === null && member.profile && !Array.isArray(member.profile));
  return activeMembers.length === 2 && activeMembers.every((member) => profileReady(member.profile, false)) && !invitationStatuses.includes("pending");
}

export function isAssignmentReadyCouple(members: Array<{ ended_at?: string | null; profile?: ReadinessProfile | null }>, invitationStatuses: string[] = []) {
  const activeMembers = members.filter((member) => member.ended_at === null && member.profile && !Array.isArray(member.profile));
  return activeMembers.length === 2 && activeMembers.every((member) => profileReady(member.profile, true)) && !invitationStatuses.includes("pending");
}

export function eligibleCoupleOptions<T extends { id: string; name: string; group_members?: unknown }>(couples: T[]) {
  return couples.filter((couple) => isAssignmentReadyCouple((Array.isArray(couple.group_members) ? couple.group_members : []) as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, (Array.isArray((couple as T & { invitations?: unknown }).invitations) ? (couple as T & { invitations: Array<{ status?: string }> }).invitations : []).map((invitation) => invitation.status ?? ""))).map(({ id, name }) => ({ id, name }));
}

export function eligibleCounselorCoupleOptions<T extends { id: string; name: string; group_members?: unknown; case_assignments?: unknown }>(couples: T[]) {
  return eligibleUnassignedCounselorCoupleOptions(couples);
}

export function eligibleUnassignedCounselorCoupleOptions<T extends { id: string; name: string; group_members?: unknown; case_assignments?: unknown }>(couples: T[]) {
  return eligibleCoupleOptions(couples.filter((couple) => !((Array.isArray(couple.case_assignments) ? couple.case_assignments : []) as Array<{ assignment_type?: string; ended_at?: string | null }>).some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null)));
}


export function availablePeopleDetailActions(detail: PeopleDetail, context: PeopleDetailActionContext): PeopleDetailAction[] {
  if (context.mode === "campus_lead") return detail.kind === "group" && detail.type === "couples" && context.coupleAssignmentReady ? [context.currentCoupleTeam ? "reassign-team" : "assign-team"] : [];
  if (detail.kind === "profile") return ["edit"];
  if (detail.type === "coaches") return ["edit", "assign-counselor"];
  if (detail.type === "campus_leads") return ["edit", "assign-campus-lead-coach"];
  if (detail.members.some((member) => member.pending)) return ["edit"];
  if (detail.type === "couples") return ["edit", ...(context.coupleAssignmentReady ? [context.currentCoupleTeam ? "reassign-team" as const : "assign-team" as const] : [])];
  if (detail.type === "counselors") return ["edit", context.currentCoachTeam ? "reassign-coach" : "assign-coach"];
  return ["edit", "assign-coach"];
}

export function filterPeopleDetailActions(actions: PeopleDetailAction[], allowedActions?: PeopleDetailAction[]) {
  return allowedActions ? actions.filter((action) => allowedActions.includes(action)) : actions;
}

export function actionLabel(action: PeopleDetailAction) {
  return {
    edit: "Edit",
    "assign-team": "Assign",
    "reassign-team": "Assign",
    "unassign-team": "Unassign",
    "assign-coach": "Assign Coach",
    "reassign-coach": "Reassign Coach",
    "assign-counselor": "Assign Counselor",
    "assign-campus-lead-coach": "Assign Coach",
  }[action];
}

type CounselingTeamContext = Pick<PeopleDetailActionContext, "coachTeams" | "counselorTeams" | "campusLeadTargets" | "selfTarget">;

export function eligibleCoupleAssignmentTeams<T extends CounselingTeamContext>(context: T) {
  const teams = [...context.coachTeams, ...context.counselorTeams]
    .filter((team) => team.active !== false)
    .sort((a, b) => `${a.name}:${a.type}`.localeCompare(`${b.name}:${b.type}`));
  const leads = (context.campusLeadTargets.length ? context.campusLeadTargets : context.selfTarget ? [context.selfTarget] : []).filter((team) => team.active !== false);
  return [...leads, ...teams];
}

export function counselingTeamsUnavailable(teams: TeamOption[]) {
  return teams.length === 0;
}

export function counselingTeamsEmptyMessage() {
  return "No eligible counseling teams are currently available.";
}

export function eligibleCampusLeadCoachTeams(coachTeams: TeamOption[], campusId: string | null, assignedCoachIds: readonly string[] = []) {
  return coachTeams.filter((team) => team.active !== false && team.campusId === campusId && !assignedCoachIds.includes(team.id));
}

export function campusLeadCoachEmptyMessage(campus: string | null) {
  return `No eligible coaches are available at the ${campus ?? "assigned"} campus.`;
}

export function campusLeadCoachAssignmentUnavailable(coachTeams: TeamOption[]) {
  return coachTeams.length === 0;
}

export function teamOptionLabel(team: TeamOption, includeType = false) {
  const type = team.type === "coach" ? "Coach" : team.type === "counselor" ? "Counselor" : "Campus Lead";
  return includeType ? `${team.name} · ${type}${team.campus ? ` · ${team.campus}` : ""}` : team.name;
}

export function counselorAssignmentLabel(team: TeamOption | null) {
  return team ? teamOptionLabel(team) : "Not assigned";
}
