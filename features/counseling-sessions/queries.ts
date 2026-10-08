import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import type { HomeworkProgressStatus } from "@/features/homework/presentation";

import { sessionCardState, type Meeting, type Progress, type Session } from "./model";
import { counselingSessionQueryFailure } from "./query-diagnostics";
import { counselingWorkspaceCoupleIdentity, type CounselingWorkspaceCoupleIdentityRow } from "./workspace-identity";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const string = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] : null;
export type CounselingSessionPartner = { id: string; name: string; photoUrl: string | null };
export type CounselingTeamMember = { id: string; name: string };
export type CounselingTeam = { campusLead: CounselingTeamMember | null; coach: CounselingTeamMember | null; counselor: CounselingTeamMember | null };
export type CounselingHomework = { title: string; partners: { profileId: string; name: string; status: HomeworkProgressStatus }[] };
export type CounselingSessionCard = { caseId: string; coupleId: string; coupleName: string; partners: CounselingSessionPartner[]; status: string; state: ReturnType<typeof sessionCardState>; team: CounselingTeam; homework: CounselingHomework | null };

export async function getCounselingSessionCards(): Promise<CounselingSessionCard[]> {
  const supabase = await createServerSupabaseClient();
  const [caseResult, sessionsResult, meetingsResult, assignmentsResult] = await Promise.all([
    supabase.from("counseling_cases").select("id,status,case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,name))").order("updated_at", { ascending: false }),
    supabase.from("sessions").select("id,sequence_number,title").eq("status", "published").order("sequence_number"),
    supabase.from("case_session_meetings").select("id,counseling_case_id,session_id,starts_at,ends_at,location").order("starts_at"),
    supabase.from("homework_assignments").select("counseling_case_id,homework:homeworks(session_id),homework_assignment_revisions(ended_at,homework_participant_progress(profile_id,status))").is("unassigned_at", null),
  ]);
  const noIdentityFailure = { error: null };
  const failure = counselingSessionQueryFailure(caseResult, sessionsResult, meetingsResult, assignmentsResult, noIdentityFailure);
  if (failure) {
    console.error("Counseling Sessions query failed.", failure);
    throw new Error("Counseling Sessions are unavailable");
  }
  const identityQueries = await Promise.all((caseResult.data ?? []).map(async (item) => {
    const caseId = item.id;
    const result = await supabase.rpc("get_counseling_workspace_couple_identity", { target_case_id: caseId });
    return { caseId, result };
  }));
  const identityFailure = identityQueries.find(({ result }) => result.error)?.result ?? noIdentityFailure;
  const identityQueryFailure = counselingSessionQueryFailure({ error: null }, { error: null }, { error: null }, { error: null }, identityFailure);
  if (identityQueryFailure) {
    console.error("Counseling Sessions query failed.", identityQueryFailure);
    throw new Error("Counseling Sessions are unavailable");
  }
  const sessions: Session[] = (sessionsResult.data ?? []).map((item, index) => ({ id: item.id, number: index + 1, title: item.title }));
  const identitiesByCase = new Map<string, CounselingWorkspaceCoupleIdentityRow[]>();
  identityQueries.forEach(({ result }) => (result.data ?? []).forEach((identity) => { const values = identitiesByCase.get(identity.counseling_case_id) ?? []; values.push(identity); identitiesByCase.set(identity.counseling_case_id, values); }));
  const meetingsByCase = new Map<string, Meeting[]>();
  (meetingsResult.data ?? []).forEach((meeting) => { const caseId = string(meeting, "counseling_case_id"); if (!caseId) return; const values = meetingsByCase.get(caseId) ?? []; values.push({ id: string(meeting, "id")!, sessionId: string(meeting, "session_id"), startsAt: string(meeting, "starts_at")!, endsAt: string(meeting, "ends_at")!, location: string(meeting, "location")! }); meetingsByCase.set(caseId, values); });
  const progressByCase = new Map<string, Progress[]>();
  const homeworkByCase = new Map<string, { sessionId: string; progress: { profileId: string; status: HomeworkProgressStatus }[] }[]>();
  (assignmentsResult.data ?? []).forEach((assignment) => { const raw = assignment as unknown as Row; const caseId = string(raw, "counseling_case_id"); const homework = raw.homework as Row | null; const sessionId = homework ? string(homework, "session_id") : null; const revision = rows(raw.homework_assignment_revisions).find((item) => item.ended_at === null); const progress = revision ? rows(revision.homework_participant_progress) : []; if (!caseId || !sessionId) return; const values = progressByCase.get(caseId) ?? []; values.push({ sessionId, complete: progress.length === 2 && progress.every((item) => item.status === "submitted" || item.status === "reviewed") }); progressByCase.set(caseId, values); const assignedProgress = progress.flatMap((item) => { const profileId = string(item, "profile_id"); const status = string(item, "status"); return profileId && status ? [{ profileId, status: status as HomeworkProgressStatus }] : []; }); const homeworkValues = homeworkByCase.get(caseId) ?? []; homeworkValues.push({ sessionId, progress: assignedProgress }); homeworkByCase.set(caseId, homeworkValues); });
  return Promise.all((caseResult.data ?? []).map(async (item) => { const raw = item as unknown as Row; const caseId = string(raw, "id")!; let identity: ReturnType<typeof counselingWorkspaceCoupleIdentity>; try { identity = counselingWorkspaceCoupleIdentity(identitiesByCase.get(caseId) ?? []); } catch { console.error("Counseling Sessions case identity projection is incomplete.", { caseId }); throw new Error("Counseling Sessions are unavailable"); } const partners = await Promise.all(identity.partners.map(async (partner) => ({ id: partner.id, name: partner.name, photoUrl: await getProfilePhotoUrl(partner.photoPath) }))); const activeAssignments = rows(raw.case_assignments).filter((assignment) => assignment.ended_at === null); const assignmentTeam = (assignmentType: string) => { const group = activeAssignments.find((assignment) => string(assignment, "assignment_type") === assignmentType)?.assigned_group as Row | null; const id = string(group, "id"); const name = string(group, "name"); return id && name ? { id, name } : null; }; const team = { campusLead: assignmentTeam("campus_lead"), coach: assignmentTeam("coach"), counselor: assignmentTeam("counselor") }; const caseMeetings = meetingsByCase.get(caseId) ?? []; const state = sessionCardState(string(raw, "status")!, sessions, caseMeetings, progressByCase.get(caseId) ?? []); const homeworkSessionId = state.session?.id ?? (state.kind === "completed" ? [...caseMeetings].reverse().find((meeting) => meeting.sessionId)?.sessionId ?? null : null); const assignedHomework = homeworkSessionId ? homeworkByCase.get(caseId)?.find((assignment) => assignment.sessionId === homeworkSessionId) : null; const homeworkSession = homeworkSessionId ? sessions.find((session) => session.id === homeworkSessionId) : null; const homework = assignedHomework ? { title: `Session ${homeworkSession?.number ?? ""} Homework`.trim(), partners: assignedHomework.progress.flatMap(({ profileId, status }) => { const partner = partners.find(({ id }) => id === profileId); return partner ? [{ profileId, name: partner.name, status }] : []; }) } : null; return { caseId, coupleId: identity.coupleId, coupleName: identity.coupleName, partners, status: string(raw, "status")!, state, team, homework }; }));
}

/** The list query is RLS-filtered, so an absent case is unavailable to this counseling-team member. */
export async function getCounselingSessionCard(caseId: string) {
  return (await getCounselingSessionCards()).find((card) => card.caseId === caseId) ?? null;
}
