import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { PeopleDetail } from "./detail-model";
import type { PeopleDetailActionContext, TeamOption } from "./detail-actions-model";

type Row = Record<string, unknown>;

function value(row: Row | null | undefined, key: string) {
  return typeof row?.[key] === "string" ? row[key] as string : null;
}

function asTeamOption(row: Row): TeamOption {
  const campus = row.campus as Row | null;
  return { id: value(row, "id")!, name: value(row, "name")!, campus: value(campus, "name"), type: row.group_type === "coach_team" ? "coach" : "counselor", active: row.active !== false };
}

export async function getPeopleDetailActionContext(detail: PeopleDetail): Promise<PeopleDetailActionContext> {
  const supabase = await createServerSupabaseClient();
  const [campusesResult, counselorResult, coachResult, currentResult] = await Promise.all([
    supabase.from("campuses").select("id,name,active").order("name"),
    supabase.from("groups").select("id,name,group_type,active,campus:campuses(name)").eq("group_type", "counselor_team").eq("active", true).order("name"),
    supabase.from("groups").select("id,name,group_type,active,campus:campuses(name)").eq("group_type", "coach_team").eq("active", true).order("name"),
    detail.kind !== "group"
      ? Promise.resolve({ data: null, error: null })
      : detail.type === "couples"
        ? supabase.from("counseling_cases").select("case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,name,group_type,active,campus:campuses(name)))").eq("couple_group_id", detail.id).maybeSingle()
        : detail.type === "counselors"
          ? supabase.from("supervision_assignments").select("ended_at,coach_group:groups!supervision_assignments_coach_group_id_fkey(id,name,group_type,active,campus:campuses(name))").eq("counselor_group_id", detail.id).is("ended_at", null).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
  ]);

  if (campusesResult.error || counselorResult.error || coachResult.error || currentResult.error) {
    throw new Error("People detail actions are unavailable");
  }

  const currentRow = currentResult.data as Row | null;
  const assignments = Array.isArray(currentRow?.case_assignments) ? currentRow.case_assignments as Row[] : [];
  const currentCoupleAssignment = assignments.find((assignment) => assignment.ended_at === null && (assignment.assignment_type === "coach" || assignment.assignment_type === "counselor"));
  const currentCounselorAssignment = assignments.find((assignment) => assignment.ended_at === null && assignment.assignment_type === "counselor");

  return {
    campuses: (campusesResult.data ?? []).map((campus) => ({ id: campus.id, name: campus.name, active: campus.active })),
    counselorTeams: (counselorResult.data ?? []).map((team) => asTeamOption(team as unknown as Row)),
    coachTeams: (coachResult.data ?? []).map((team) => asTeamOption(team as unknown as Row)),
    currentCounselorTeam: currentCounselorAssignment ? asTeamOption(currentCounselorAssignment.assigned_group as Row) : null,
    currentCoachTeam: currentRow?.coach_group ? asTeamOption(currentRow.coach_group as Row) : null,
    currentCoupleTeam: currentCoupleAssignment ? { ...asTeamOption(currentCoupleAssignment.assigned_group as Row), type: currentCoupleAssignment.assignment_type as "coach" | "counselor" } : null,
    currentCoupleAssignmentType: currentCoupleAssignment?.assignment_type === "coach" || currentCoupleAssignment?.assignment_type === "counselor" ? currentCoupleAssignment.assignment_type : null,
  };
}
