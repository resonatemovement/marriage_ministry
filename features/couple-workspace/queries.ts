import "server-only";

import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import { coupleDisplayName } from "@/features/people/types";
import { getSessionMaterialBlocks } from "@/features/session-builder/queries";
import type { StagedMaterialBlock } from "@/features/session-builder/editor-model";
import type { HomeworkProgressStatus } from "@/features/homework/presentation";
import { getCurrentCoupleCounselor } from "@/features/counseling-contacts/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const string = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] : null;

export type CoupleWorkspaceData = {
  coupleName: string;
  partners: { id: string; name: string; photoUrl: string | null }[];
  status: string;
  completed: boolean;
  team: { counselor: { caseId: string; id: string; name: string } | null };
  totalSessions: number;
  currentSession: { id: string; number: number; title: string; materials: StagedMaterialBlock[] } | null;
  initialMeeting: Meeting | null;
  nextMeeting: Meeting | null;
  homework: { title: string; status: HomeworkProgressStatus } | null;
};
export type Meeting = { startsAt: string; location: string };

export async function getCoupleWorkspaceData(authenticatedProfileId: string): Promise<CoupleWorkspaceData | null> {
  const supabase = await createServerSupabaseClient();
  const teamResult = await supabase.rpc("get_current_couple_case_team");
  if (teamResult.error) throw new Error("Couple Workspace is unavailable");
  const teamRow = teamResult.data?.[0];
  if (!teamRow) return null;

  const [caseResult, meetingsResult, assignmentResult, counselor] = await Promise.all([
    supabase.from("counseling_cases").select("id,status,closed_at,couple:groups!counseling_cases_couple_group_id_fkey(name,group_members(ended_at,profile:profiles(id,first_name,last_name,email,photo_path)))").eq("id", teamRow.counseling_case_id).maybeSingle(),
    supabase.from("case_session_meetings").select("session_id,starts_at,location").eq("counseling_case_id", teamRow.counseling_case_id).order("starts_at"),
    supabase.from("homework_assignments").select("homework:homeworks(id,session_id),homework_assignment_revisions(ended_at,homework_participant_progress(profile_id,status))").eq("counseling_case_id", teamRow.counseling_case_id).is("unassigned_at", null).eq("homework_assignment_revisions.homework_participant_progress.profile_id", authenticatedProfileId),
    getCurrentCoupleCounselor(),
  ]);
  for (const [label, error] of [["caseResult", caseResult.error], ["meetingsResult", meetingsResult.error], ["assignmentResult", assignmentResult.error]] as const) {
    if (error) console.error(`[Couple Workspace] Query failure: ${label}`, { message: error.message, code: error.code, details: error.details, hint: error.hint });
  }
  if (caseResult.error || meetingsResult.error || assignmentResult.error || !caseResult.data) throw new Error("Couple Workspace is unavailable");

  const counselingCase = caseResult.data as unknown as Row;
  const couple = counselingCase.couple as Row | null;
  const members = rows(couple?.group_members).filter((member) => member.ended_at === null);
  const partners = await Promise.all(members.flatMap((member) => {
    const profile = member.profile as Row | null;
    const id = string(profile, "id");
    if (!id) return [];
    const name = [string(profile, "first_name"), string(profile, "last_name")].filter(Boolean).join(" ") || string(profile, "email") || "Partner";
    return [{ id, name, photoPath: string(profile, "photo_path") }];
  }).map(async (partner) => ({ id: partner.id, name: partner.name, photoUrl: await getProfilePhotoUrl(partner.photoPath) })));
  const coupleName = coupleDisplayName(string(couple, "name"), members.map((member) => {
    const profile = member.profile as Row | null;
    return { firstName: string(profile, "first_name"), lastName: string(profile, "last_name"), email: string(profile, "email") };
  }), []);
  const meetings = (meetingsResult.data ?? []).map((item) => ({ sessionId: item.session_id, startsAt: item.starts_at, location: item.location }));
  const normalMeetings = meetings.filter((meeting) => meeting.sessionId !== null);
  const currentMeeting = normalMeetings.at(-1) ?? null;
  const initialMeeting = meetings.find((meeting) => meeting.sessionId === null) ?? null;
  const sessionResult = currentMeeting?.sessionId ? await supabase.from("sessions").select("id,sequence_number,title").eq("id", currentMeeting.sessionId).maybeSingle() : { data: null, error: null };
  if (sessionResult.error) throw new Error("Couple Workspace is unavailable");
  const materials = sessionResult.data ? await getSessionMaterialBlocks(sessionResult.data.id) : [];
  const currentSession = sessionResult.data ? { id: sessionResult.data.id, number: sessionResult.data.sequence_number, title: sessionResult.data.title, materials: materials.map((block) => ({
    key: block.id, persistedId: block.id, blockType: block.blockType, title: block.title ?? "", richTextContent: block.richTextContent, url: block.url ?? "", description: block.description ?? "", resourceId: block.resourceId, resourceCategory: block.resourceCategory, resource: block.resource,
  })) } : null;
  const assignment = (assignmentResult.data ?? []).map((item) => item as unknown as Row).find((item) => string(item.homework as Row | null, "session_id") === currentSession?.id);
  const revision = assignment ? rows(assignment.homework_assignment_revisions).find((item) => item.ended_at === null) : null;
  const progress = revision ? rows(revision.homework_participant_progress).find((item) => string(item, "profile_id") === authenticatedProfileId) : null;
  return {
    coupleName,
    partners,
    status: string(counselingCase, "status") ?? "active",
    completed: Boolean(counselingCase.closed_at),
    team: { counselor: counselor ? { caseId: counselor.caseId, id: counselor.id, name: counselor.name } : null },
    totalSessions: teamRow.published_session_count,
    currentSession,
    initialMeeting: initialMeeting ? { startsAt: initialMeeting.startsAt, location: initialMeeting.location } : null,
    nextMeeting: currentMeeting ? { startsAt: currentMeeting.startsAt, location: currentMeeting.location } : initialMeeting ? { startsAt: initialMeeting.startsAt, location: initialMeeting.location } : null,
    homework: assignment && progress && progress.status ? { title: `Session ${currentSession?.number ?? ""} Homework`.trim(), status: progress.status as HomeworkProgressStatus } : null,
  };
}
