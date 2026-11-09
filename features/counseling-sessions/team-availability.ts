import "server-only";

import type { WorkspaceId } from "@/lib/workspaces";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const TEAM_TYPE_BY_WORKSPACE = {
  counselor: "counselor_team",
  coach: "coach_team",
  campus_lead: "campus_lead_team",
} as const satisfies Partial<Record<WorkspaceId, string>>;

export type CounselingTeamAvailability = { teamId: string; acceptingNewCouples: boolean };

export async function getMyCounselingTeamAvailability(workspace: WorkspaceId): Promise<CounselingTeamAvailability | null> {
  const teamType = TEAM_TYPE_BY_WORKSPACE[workspace as keyof typeof TEAM_TYPE_BY_WORKSPACE];
  if (!teamType) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_counseling_team_availability", { target_group_type: teamType });
  if (error) throw new Error("Team availability is unavailable");

  const row = data?.[0];
  return typeof row?.team_id === "string" && typeof row.accepting_new_couples === "boolean"
    ? { teamId: row.team_id, acceptingNewCouples: row.accepting_new_couples }
    : null;
}
