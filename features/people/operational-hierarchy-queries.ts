import "server-only";

import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { buildOperationalHierarchy, type OperationalHierarchy, type OperationalHierarchyTeam } from "./operational-hierarchy-model";

type Row = Record<string, unknown>;
const value = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] as string : null;
type AssignmentClient = { from: (table: "campus_lead_coach_assignments") => { select: (columns: string) => { is: (column: string, value: null) => Promise<{ data: Row[] | null; error: { message: string } | null }> } } };

export async function getOperationalHierarchy(): Promise<OperationalHierarchy> {
  const supabase = await createServerSupabaseClient();
  const [teamsResult, leadCoachResult, coachCounselorResult] = await Promise.all([
    supabase.from("groups").select("id,name,group_type,campus:campuses(name),group_members(ended_at,profile:profiles(photo_path))").in("group_type", ["campus_lead_team", "coach_team", "counselor_team"] as never[]).eq("active", true),
    (supabase as unknown as AssignmentClient).from("campus_lead_coach_assignments").select("campus_lead_group_id,coach_group_id").is("ended_at", null),
    supabase.from("supervision_assignments").select("coach_group_id,counselor_group_id").is("ended_at", null),
  ]);
  if (teamsResult.error || leadCoachResult.error || coachCounselorResult.error) throw new Error("Operational hierarchy is unavailable");
  const teams = await Promise.all(((teamsResult.data ?? []) as unknown as Row[]).map(async (row): Promise<OperationalHierarchyTeam> => {
    const members = Array.isArray(row.group_members) ? row.group_members as Row[] : [];
    const profile = members.find((member) => member.ended_at === null)?.profile as Row | undefined;
    const campus = row.campus as Row | null;
    const role = row.group_type === "campus_lead_team" ? "campus_lead" : row.group_type === "coach_team" ? "coach" : "counselor";
    return { id: value(row, "id")!, name: value(row, "name")!, campus: value(campus, "name"), role, photoUrl: await getProfilePhotoUrl(value(profile, "photo_path")) };
  }));
  return buildOperationalHierarchy(teams, ((leadCoachResult.data ?? []) as Row[]).map((row) => ({ campusLeadId: value(row, "campus_lead_group_id")!, coachId: value(row, "coach_group_id")! })), ((coachCounselorResult.data ?? []) as Row[]).map((row) => ({ coachId: value(row, "coach_group_id")!, counselorId: value(row, "counselor_group_id")! })));
}
