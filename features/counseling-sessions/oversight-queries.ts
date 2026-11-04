import "server-only";

import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { counselingWorkspaceCoupleIdentity, type CounselingWorkspaceCoupleIdentityRow } from "./workspace-identity";

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

export type CounselingOversightPartner = { id: string; name: string; photoUrl: string | null; gender: "male" | "female" | null };
export type CounselingOversightIdentity = { coupleName: string; partners: CounselingOversightPartner[] };

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

type IdentityRpcClient = {
  rpc(name: "get_counseling_workspace_couple_identity", args: { target_case_id: string }): Promise<{ data: CounselingWorkspaceCoupleIdentityRow[] | null; error: { message: string; code?: string } | null }>;
};

type OversightIdentityRpcClient = {
  rpc(name: "get_counseling_oversight_couple_identity", args: { target_team_id: string; target_case_id: string }): Promise<{ data: CounselingWorkspaceCoupleIdentityRow[] | null; error: { message: string; code?: string } | null }>;
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

/** Prefers direct Case identity access, then uses the narrowly Case/team-scoped oversight identity contract. */
export async function getCounselingOversightIdentity(teamId: string, caseId: string): Promise<CounselingOversightIdentity | null> {
  const supabase = await client();
  const identityClient = supabase as unknown as IdentityRpcClient;
  const direct = await identityClient.rpc("get_counseling_workspace_couple_identity", { target_case_id: caseId });
  let data = direct.data;
  if (direct.error || !data?.length) {
    const oversightClient = supabase as unknown as OversightIdentityRpcClient;
    const oversight = await oversightClient.rpc("get_counseling_oversight_couple_identity", {
      target_team_id: teamId,
      target_case_id: caseId,
    });
    if (oversight.error) {
      console.error("Oversight Couple identity query failed.", { code: oversight.error.code });
      return null;
    }
    data = oversight.data;
  }
  if (!data?.length) return null;
  try {
    const identity = counselingWorkspaceCoupleIdentity(data);
    const partners = await Promise.all(identity.partners.map(async (partner) => ({
      id: partner.id,
      name: partner.name,
      gender: partner.gender ?? null,
      photoUrl: await getProfilePhotoUrl(partner.photoPath),
    })));
    return { coupleName: identity.coupleName, partners };
  } catch {
    console.error("Oversight Couple identity projection is incomplete.", { caseId });
    return null;
  }
}

/** Returns subordinate team identities only when the caller may oversee the Coach team. */
export async function getOversightCounselorTeams(coachTeamId: string) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_oversight_counselor_teams", { target_coach_team_id: coachTeamId });
  if (error) throw new Error("Counseling team hierarchy is unavailable");
  return (data ?? []).map((team) => ({ id: team.id, name: team.name, campus: team.campus_name }));
}
