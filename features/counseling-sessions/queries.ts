import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import type { HomeworkProgressStatus } from "@/features/homework/presentation";

import { publishedSessionOptions, sessionCardState, type CaseSession, type Meeting, type Session, type SessionContentOption, type SessionTemplate } from "./model";
import { counselingSessionQueryFailure } from "./query-diagnostics";
import { projectCounselingHomeworkProgress, type CounselingHomeworkProgress } from "./homework-query-projection";
import { counselingWorkspaceCoupleIdentity, type CounselingWorkspaceCoupleIdentityRow } from "./workspace-identity";
import type { SubmittedHomeworkReview } from "./submitted-homework-review";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const string = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] : null;
export type CounselingSessionPartner = { id: string; firstName?: string | null; name: string; photoUrl: string | null; gender?: "male" | "female" | null };
type CounselingTeamMember = { id: string; name: string };
export type CounselingTeam = { campusLead: CounselingTeamMember | null; coach: CounselingTeamMember | null; counselor: CounselingTeamMember | null };
export type CounselingHomework = { title: string; complete: boolean; partners: { progressId: string; profileId: string; name: string; status: HomeworkProgressStatus }[] };
export type CounselingSessionCard = { caseId: string; coupleId: string; coupleName: string; partners: CounselingSessionPartner[]; status: string; state: ReturnType<typeof sessionCardState>; publishedSessions: Session[]; team: CounselingTeam; homework: CounselingHomework | null; materialSessions: { id: string; title: string; actualSequence: number; templateSequence: number; status: "active" | "completed" }[] };

export async function getCounselingSessionCards(): Promise<CounselingSessionCard[]> {
  const supabase = await createServerSupabaseClient();
  const [caseResult, sessionsResult, meetingsResult, caseSessionsResult, assignmentsResult, materialOptionsResult] = await Promise.all([
    supabase.from("counseling_cases").select("id,status,case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,name))").order("updated_at", { ascending: false }),
    supabase.from("sessions").select("id,sequence_number,title,status,is_final").order("sequence_number"),
    supabase.from("case_session_meetings").select("id,counseling_case_id,session_id,case_session_id,starts_at,ends_at,location,completed_at,created_at").order("created_at").order("id"),
    supabase.from("case_sessions").select("id,counseling_case_id,session_id,actual_sequence,template_sequence_number,title,status,is_final,homework_assignment_revision_id,material_released_at,homework_released_at").order("actual_sequence"),
    supabase.from("homework_assignments").select("counseling_case_id,homework_assignment_revisions(id,ended_at,homework_participant_progress(id,profile_id,status))").is("unassigned_at", null),
    supabase.rpc("get_published_session_material_options"),
  ]);
  const noIdentityFailure = { error: null };
  const failure = counselingSessionQueryFailure(caseResult, sessionsResult, meetingsResult, caseSessionsResult, assignmentsResult, materialOptionsResult, noIdentityFailure);
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
  const identityQueryFailure = counselingSessionQueryFailure({ error: null }, { error: null }, { error: null }, { error: null }, { error: null }, { error: null }, identityFailure);
  if (identityQueryFailure) {
    console.error("Counseling Sessions query failed.", identityQueryFailure);
    throw new Error("Counseling Sessions are unavailable");
  }
  type SessionRow = { id: string; sequence_number: number; title: string; status: string; is_final: boolean };
  const templates: SessionTemplate[] = ((sessionsResult.data ?? []) as unknown as SessionRow[]).map((item) => ({ id: item.id, sequenceNumber: item.sequence_number, title: item.title, status: item.status, isFinal: item.is_final }));
  type MaterialOptionRow = { session_id: string; block_id: string; block_type: SessionContentOption["blockType"]; block_position: number; label: string; resource_category: string | null; is_recommended: boolean };
  const materialBySession = new Map<string, SessionContentOption[]>();
  ((materialOptionsResult.data ?? []) as MaterialOptionRow[]).forEach((item) => {
    const content = materialBySession.get(item.session_id) ?? [];
    content.push({ id: item.block_id, blockType: item.block_type, position: item.block_position, label: item.label, resourceCategory: item.resource_category, isRecommended: item.is_recommended });
    materialBySession.set(item.session_id, content);
  });
  const sessions: Session[] = publishedSessionOptions(templates).map((session) => ({ ...session, content: materialBySession.get(session.id) ?? [] }));
  const identitiesByCase = new Map<string, CounselingWorkspaceCoupleIdentityRow[]>();
  identityQueries.forEach(({ result }) => (result.data ?? []).forEach((identity) => {
    const values = identitiesByCase.get(identity.counseling_case_id) ?? [];
    const gender = identity.gender === "male" || identity.gender === "female" ? identity.gender : undefined;
    values.push({ ...identity, gender });
    identitiesByCase.set(identity.counseling_case_id, values);
  }));
  const meetingsByCase = new Map<string, Meeting[]>();
  (meetingsResult.data ?? []).forEach((meeting) => { const caseId = string(meeting, "counseling_case_id"); if (!caseId) return; const values = meetingsByCase.get(caseId) ?? []; values.push({ id: string(meeting, "id")!, sessionId: string(meeting, "session_id"), caseSessionId: string(meeting, "case_session_id"), startsAt: string(meeting, "starts_at")!, endsAt: string(meeting, "ends_at")!, location: string(meeting, "location")!, completedAt: string(meeting, "completed_at"), createdAt: string(meeting, "created_at")! }); meetingsByCase.set(caseId, values); });
  const caseSessionsByCase = new Map<string, CaseSession[]>();
  (caseSessionsResult.data ?? []).forEach((item) => { const raw = item as unknown as Row; const caseId = string(raw, "counseling_case_id"); const sessionId = string(raw, "session_id"); const status = string(raw, "status"); if (!caseId || !sessionId || (status !== "active" && status !== "completed")) return; const values = caseSessionsByCase.get(caseId) ?? []; values.push({ id: string(raw, "id")!, sessionId, actualSequence: Number(raw.actual_sequence), templateSequence: Number(raw.template_sequence_number), title: string(raw, "title")!, status, isFinal: raw.is_final === true, homeworkAssignmentRevisionId: string(raw, "homework_assignment_revision_id"), materialReleasedAt: string(raw, "material_released_at")!, homeworkReleasedAt: string(raw, "homework_released_at") }); caseSessionsByCase.set(caseId, values); });
  const pinnedCaseSessions = [...caseSessionsByCase].flatMap(([caseId, caseSessions]) => caseSessions.map((caseSession) => ({
    counselingCaseId: caseId,
    sessionId: caseSession.sessionId,
    homeworkAssignmentRevisionId: caseSession.homeworkAssignmentRevisionId,
  })));
  const { progressByCase, homeworkByRevision } = projectCounselingHomeworkProgress(
    (assignmentsResult.data ?? []) as unknown as Parameters<typeof projectCounselingHomeworkProgress>[0],
    pinnedCaseSessions,
  );
  return Promise.all((caseResult.data ?? []).map(async (item) => { const raw = item as unknown as Row; const caseId = string(raw, "id")!; let identity: ReturnType<typeof counselingWorkspaceCoupleIdentity>; try { identity = counselingWorkspaceCoupleIdentity(identitiesByCase.get(caseId) ?? []); } catch { console.error("Counseling Sessions case identity projection is incomplete.", { caseId }); throw new Error("Counseling Sessions are unavailable"); } const partners = await Promise.all(identity.partners.map(async (partner) => ({ id: partner.id, firstName: partner.firstName, name: partner.name, gender: partner.gender ?? null, photoUrl: await getProfilePhotoUrl(partner.photoPath) }))); const activeAssignments = rows(raw.case_assignments).filter((assignment) => assignment.ended_at === null); const assignmentTeam = (assignmentType: string) => { const group = activeAssignments.find((assignment) => string(assignment, "assignment_type") === assignmentType)?.assigned_group as Row | null; const id = string(group, "id"); const name = string(group, "name"); return id && name ? { id, name } : null; }; const team = { campusLead: assignmentTeam("campus_lead"), coach: assignmentTeam("coach"), counselor: assignmentTeam("counselor") }; const caseMeetings = meetingsByCase.get(caseId) ?? []; const caseSessionRows = caseSessionsByCase.get(caseId) ?? []; const state = sessionCardState(string(raw, "status")!, sessions, caseMeetings, progressByCase.get(caseId) ?? [], caseSessionRows); const homeworkCaseSession = state.caseSession ?? [...caseSessionRows].sort((a, b) => b.actualSequence - a.actualSequence)[0] ?? null; const homeworkRevisionId = homeworkCaseSession?.homeworkAssignmentRevisionId; const assignedHomework: CounselingHomeworkProgress | undefined = homeworkRevisionId ? homeworkByRevision.get(homeworkRevisionId) : undefined; const homework = assignedHomework && homeworkCaseSession ? { title: `Session ${homeworkCaseSession.templateSequence} Homework`, complete: assignedHomework.complete, partners: assignedHomework.progress.flatMap(({ progressId, profileId, status }) => { const partner = partners.find(({ id }) => id === profileId); return partner ? [{ progressId, profileId, name: partner.name, gender: partner.gender, status }] : []; }).sort((left, right) => partners.findIndex((partner) => partner.id === left.profileId) - partners.findIndex((partner) => partner.id === right.profileId)) } : null; const suggestedNext = state.caseSession ? sessions.find((session) => session.number > state.caseSession!.templateSequence) ?? null : null; const completedSessions = caseSessionRows.filter((session) => session.status === "completed").map((session) => session.sessionId); const progressionSessions = sessions.filter((session) => !completedSessions.includes(session.id) && session.id !== state.caseSession?.sessionId); return { caseId, coupleId: identity.coupleId, coupleName: identity.coupleName, partners, status: string(raw, "status")!, state: state.caseSession ? { ...state, nextSession: progressionSessions.find((session) => session.id === suggestedNext?.id) ?? null } : state, publishedSessions: progressionSessions, team, homework, materialSessions: caseSessionRows.map(({ id, title, actualSequence, templateSequence, status }) => ({ id, title, actualSequence, templateSequence, status })) }; }));
}

/** The list query is RLS-filtered, so an absent case is unavailable to this counseling-team member. */
export async function getCounselingSessionCard(caseId: string) {
  return (await getCounselingSessionCards()).find((card) => card.caseId === caseId) ?? null;
}

export async function getCounselorSubmittedHomeworkReview(progressId: string): Promise<SubmittedHomeworkReview | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_counselor_submitted_homework_review", { target_progress_id: progressId });
  if (error) {
    console.error("Submitted Homework review query failed.", { code: error.code });
    throw new Error("Submitted Homework is unavailable");
  }
  return data as unknown as SubmittedHomeworkReview | null;
}
