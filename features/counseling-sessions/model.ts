import { withAuthoredSessionNumbers } from "@/features/session-builder/presentation";

export type Meeting = { id: string; sessionId: string | null; caseSessionId: string | null; startsAt: string; endsAt: string; location: string; completedAt: string | null; createdAt: string };
export type SessionContentOption = { id: string; blockType: "rich_text" | "video_link" | "library_resource"; position: number; label: string; resourceCategory: string | null; isRecommended: boolean };
export type Session = { id: string; number: number; title: string; isFinal: boolean; content?: SessionContentOption[] };
export type SessionTemplate = { id: string; sequenceNumber: number; title: string; status: string; isFinal: boolean };
export type Progress = { sessionId: string; complete: boolean };
export type CaseSession = { id: string; sessionId: string; actualSequence: number; templateSequence: number; title: string; status: "active" | "completed"; isFinal: boolean; homeworkAssignmentRevisionId: string | null; materialReleasedAt: string; homeworkReleasedAt: string | null };
export type SessionCardState = { kind: "initial" | "session" | "completed" | "closed"; label: string; detail: string; action: "schedule-initial" | "complete-initial" | "complete-session" | "reschedule-meeting" | null; canReschedule: boolean; session: Session | null; caseSession: CaseSession | null; nextSession: Session | null; meeting: Meeting | null; pastMeetings: Meeting[]; previousMeeting: Meeting | null; progress: string };

export function publishedSessionOptions(templates: readonly SessionTemplate[]): Session[] {
  return withAuthoredSessionNumbers(templates)
    .filter((session) => session.status === "published")
    .map((session) => ({ id: session.id, number: session.authoredSessionNumber, title: session.title, isFinal: session.isFinal }));
}

export function sessionCardState(status: string, sessions: readonly Session[], meetings: readonly Meeting[], progress: readonly Progress[], caseSessions: readonly CaseSession[] = []): SessionCardState {
  if (status === "finished" || status === "inactive" || status === "referred") {
    const completed = status === "finished";
    const label = completed ? "COMPLETED" : status === "inactive" ? "CLOSED — INCOMPLETE" : "REFERRED";
    const detail = completed ? "Counseling journey complete" : status === "inactive" ? "Counseling ended before program completion" : "Referred to another provider";
    return { kind: completed ? "completed" : "closed", label, detail, action: null, canReschedule: false, session: null, caseSession: null, nextSession: null, meeting: null, pastMeetings: [], previousMeeting: null, progress: `${caseSessions.length} Sessions` };
  }
  const initial = meetings.find((meeting) => meeting.sessionId === null) ?? null;
  const active = caseSessions.find((caseSession) => caseSession.status === "active") ?? null;
  if (!active) return { kind: "initial", label: "SESSION 0", detail: initial ? "Initial Meeting" : "Initial Meeting · Not Scheduled", action: initial ? "complete-initial" : "schedule-initial", canReschedule: Boolean(initial), session: null, caseSession: null, nextSession: sessions[0] ?? null, meeting: initial, pastMeetings: [], previousMeeting: null, progress: `Session 0 of ${sessions.length}` };
  const session = { id: active.sessionId, number: active.templateSequence, title: active.title, isFinal: active.isFinal };
  const sessionMeetings = meetings.filter((item) => item.caseSessionId === active.id);
  const meeting = [...sessionMeetings].reverse().find((item) => item.completedAt === null) ?? null;
  const pastMeetings = sessionMeetings.filter((item) => item.id !== meeting?.id);
  const previousSessionIds = new Set(caseSessions.filter((item) => item.actualSequence < active.actualSequence).map((item) => item.id));
  const previousMeeting = [...pastMeetings].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]
    ?? meetings.filter((item) => item.caseSessionId === null && item.sessionId === null || item.caseSessionId !== null && previousSessionIds.has(item.caseSessionId)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]
    ?? null;
  void progress;
  return { kind: "session", label: `SESSION ${active.templateSequence}`, detail: active.title, action: "complete-session", canReschedule: Boolean(meeting), session, caseSession: active, nextSession: null, meeting, pastMeetings, previousMeeting, progress: `Session ${active.actualSequence} of ${sessions.length}` };
}

export function canManageSessions(roles: readonly string[]) { return roles.some((role) => role === "campus_lead" || role === "coach" || role === "counselor"); }
