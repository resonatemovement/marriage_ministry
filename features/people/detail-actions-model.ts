import type { PeopleDetail } from "./detail-model";

export type TeamType = "coach" | "counselor";
export type PeopleDetailAction = "edit" | "assign-team" | "reassign-team" | "assign-coach" | "reassign-coach";

export interface TeamOption {
  id: string;
  name: string;
  campus: string | null;
  type: TeamType;
  active?: boolean;
}

export interface CampusOption {
  id: string;
  name: string;
  active: boolean;
}

export interface PeopleDetailActionContext {
  campuses: CampusOption[];
  counselorTeams: TeamOption[];
  coachTeams: TeamOption[];
  currentCounselorTeam: TeamOption | null;
  currentCoachTeam: TeamOption | null;
  currentCoupleTeam: TeamOption | null;
  currentCoupleAssignmentType: TeamType | null;
}

export function availablePeopleDetailActions(detail: PeopleDetail, context: PeopleDetailActionContext): PeopleDetailAction[] {
  if (detail.kind === "profile" || detail.type === "coaches") return ["edit"];
  if (detail.members.some((member) => member.pending)) return ["edit"];
  if (detail.type === "couples") return ["edit", context.currentCoupleTeam ? "reassign-team" : "assign-team"];
  return ["edit", context.currentCoachTeam ? "reassign-coach" : "assign-coach"];
}

export function actionLabel(action: PeopleDetailAction) {
  return {
    edit: "Edit",
    "assign-team": "Assign Counselor",
    "reassign-team": "Reassign Counselor",
    "assign-coach": "Assign Coach",
    "reassign-coach": "Reassign Coach",
  }[action];
}

export function eligibleCoupleAssignmentTeams(context: PeopleDetailActionContext) {
  return [...context.coachTeams, ...context.counselorTeams]
    .filter((team) => team.active !== false)
    .sort((a, b) => `${a.name}:${a.type}`.localeCompare(`${b.name}:${b.type}`));
}

export function teamOptionLabel(team: TeamOption, includeType = false) {
  const type = team.type === "coach" ? "Coach" : "Counselor";
  return includeType ? `${team.name} · ${type}${team.campus ? ` · ${team.campus}` : ""}` : team.name;
}
