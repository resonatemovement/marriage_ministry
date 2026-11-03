import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { coachCaseScope, type CoachCaseAssignment, type CoachCaseScope } from "./coach-case-scope";

type Row = Record<string, unknown>;
const value = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] as string : null;

export type CampusLeadCoach = { id: string; name: string; campus: string | null };
export type CoachCounselor = { id: string; name: string; campus: string | null };

async function getActiveCoachTeamIds(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, profileId: string): Promise<string[]> {
  const teamsResult = await supabase
    .from("groups")
    .select("id,group_members!inner(profile_id,ended_at)")
    .eq("group_type", "coach_team" as never)
    .eq("active", true)
    .eq("group_members.profile_id", profileId)
    .is("group_members.ended_at", null);
  if (teamsResult.error) throw new Error("Workspace team data is unavailable");
  return (teamsResult.data ?? []).map((team) => team.id);
}

/** Resolves the signed-in Coach's active-team Case scope; database RLS remains authoritative. */
export async function getCurrentCoachCaseScope(): Promise<CoachCaseScope> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !profileId) throw new Error("Workspace team data is unavailable");

  const activeCoachTeamIds = await getActiveCoachTeamIds(supabase, profileId);
  if (!activeCoachTeamIds.length) return { caseIds: [], coupleContactCaseIds: [] };

  const assignmentsResult = await supabase
    .from("case_assignments")
    .select("counseling_case_id,assigned_group_id,assignment_type,ended_at")
    .in("assigned_group_id", activeCoachTeamIds)
    .eq("assignment_type", "counselor")
    .is("ended_at", null);
  if (assignmentsResult.error) throw new Error("Workspace Case assignments are unavailable");

  return coachCaseScope((assignmentsResult.data ?? []) as CoachCaseAssignment[], activeCoachTeamIds);
}

/** Lists only Counselor teams actively supervised by the signed-in Coach's active team. */
export async function getCurrentCoachCounselors(): Promise<CoachCounselor[]> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !profileId) throw new Error("Workspace team data is unavailable");

  const coachTeamIds = await getActiveCoachTeamIds(supabase, profileId);
  if (!coachTeamIds.length) return [];

  const assignmentsResult = await supabase
    .from("supervision_assignments")
    .select("counselor_group:groups!supervision_assignments_counselor_group_id_fkey(id,name,group_type,active,campus:campuses(name))")
    .in("coach_group_id", coachTeamIds)
    .is("ended_at", null);
  if (assignmentsResult.error) throw new Error("Workspace team data is unavailable");

  return (assignmentsResult.data ?? [])
    .flatMap((assignment) => {
      const team = (assignment as unknown as Row).counselor_group as Row | null;
      const campus = team?.campus as Row | null;
      if (!team || value(team, "group_type") !== "counselor_team" || team.active !== true) return [];
      const id = value(team, "id");
      const name = value(team, "name");
      return id && name ? [{ id, name, campus: value(campus, "name") }] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Reads only the signed-in Campus Lead's active Coach-team assignments; RLS remains authoritative. */
export async function getCurrentCampusLeadCoaches(): Promise<CampusLeadCoach[]> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (claimsError || !profileId) throw new Error("Workspace team data is unavailable");

  const leadResult = await supabase
    .from("groups")
    .select("id,group_members!inner(profile_id,ended_at)")
    .eq("group_type", "campus_lead_team" as never)
    .eq("active", true)
    .eq("group_members.profile_id", profileId)
    .is("group_members.ended_at", null)
    .maybeSingle();
  if (leadResult.error) throw new Error("Workspace team data is unavailable");
  if (!leadResult.data) return [];

  const coachesResult = await supabase
    .from("campus_lead_coach_assignments")
    .select("coach_group:groups!campus_lead_coach_assignments_coach_group_id_fkey(id,name,group_type,active,campus:campuses(name))")
    .eq("campus_lead_group_id", leadResult.data.id)
    .is("ended_at", null);
  if (coachesResult.error) throw new Error("Workspace team data is unavailable");

  return (coachesResult.data ?? [])
    .flatMap((assignment) => {
      const coach = (assignment as unknown as Row).coach_group as Row | null;
      const campus = coach?.campus as Row | null;
      if (!coach || value(coach, "group_type") !== "coach_team" || coach.active === false) return [];
      const id = value(coach, "id");
      const name = value(coach, "name");
      return id && name ? [{ id, name, campus: value(campus, "name") }] : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
