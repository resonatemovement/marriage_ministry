import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CounselingOversightProgress = {
  teamId: string;
  teamName: string;
  caseId: string;
  coupleId: string;
  coupleName: string;
  caseStatus: string;
  sessionProgress: string;
  nextMeetingAt: string | null;
  homeworkStatus: string;
};

type OversightRow = {
  team_id: string;
  team_name: string;
  counseling_case_id: string;
  couple_group_id: string;
  couple_name: string;
  case_status: string;
  session_progress: string;
  next_meeting_at: string | null;
  homework_status: string;
};

type CounselorTeamRow = { id: string; name: string; campus_name: string | null };

type OversightRpcClient = {
  rpc(name: "get_counseling_oversight_progress", args: { target_team_id: string }): Promise<{ data: OversightRow[] | null; error: { message: string } | null }>;
} & {
  rpc(name: "get_oversight_counselor_teams", args: { target_coach_team_id: string }): Promise<{ data: CounselorTeamRow[] | null; error: { message: string } | null }>;
};

function client() {
  return createServerSupabaseClient().then((supabase) => supabase as unknown as OversightRpcClient);
}

function present(row: OversightRow): CounselingOversightProgress {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    caseId: row.counseling_case_id,
    coupleId: row.couple_group_id,
    coupleName: row.couple_name,
    caseStatus: row.case_status,
    sessionProgress: row.session_progress,
    nextMeetingAt: row.next_meeting_at,
    homeworkStatus: row.homework_status,
  };
}

/** Returns only the database-authorized, read-only Case progress projection for a team. */
export async function getCounselingOversightProgress(teamId: string): Promise<CounselingOversightProgress[]> {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_counseling_oversight_progress", { target_team_id: teamId });
  if (error) throw new Error("Counseling progress is unavailable");
  return (data ?? []).map(present);
}

/** Returns subordinate team identities only when the caller may oversee the Coach team. */
export async function getOversightCounselorTeams(coachTeamId: string) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_oversight_counselor_teams", { target_coach_team_id: coachTeamId });
  if (error) throw new Error("Counseling team hierarchy is unavailable");
  return (data ?? []).map((team) => ({ id: team.id, name: team.name, campus: team.campus_name }));
}
