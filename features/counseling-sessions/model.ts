export type Meeting = { id: string; sessionId: string | null; startsAt: string; endsAt: string; location: string };
export type Session = { id: string; number: number; title: string };
export type Progress = { sessionId: string; complete: boolean };
export type SessionCardState = { kind: "initial" | "session" | "completed"; label: string; detail: string; action: "schedule-initial" | "reschedule-initial" | "schedule-meeting" | "reschedule-meeting" | "schedule-next" | "close-case" | null; session: Session | null; nextSession: Session | null; meeting: Meeting | null; progress: string };

export function sessionCardState(status: string, sessions: readonly Session[], meetings: readonly Meeting[], progress: readonly Progress[]): SessionCardState {
  if (status === "finished") return { kind: "completed", label: "COMPLETED", detail: "Counseling journey complete", action: null, session: null, nextSession: null, meeting: null, progress: `${sessions.length} Sessions` };
  const initial = meetings.find((meeting) => meeting.sessionId === null) ?? null;
  const normal = meetings.filter((meeting) => meeting.sessionId !== null);
  if (!normal.length) return { kind: "initial", label: "INITIAL MEETING", detail: initial ? "Scheduled" : "Not Scheduled", action: initial ? "reschedule-initial" : "schedule-initial", session: null, nextSession: sessions[0] ?? null, meeting: initial, progress: `0 of ${sessions.length} Sessions` };
  const currentMeeting = normal.at(-1)!;
  const session = sessions.find((item) => item.id === currentMeeting.sessionId) ?? null;
  const complete = progress.find((item) => item.sessionId === session?.id)?.complete ?? false;
  const final = session !== null && sessions.at(-1)?.id === session.id;
  const action = complete ? (final ? "close-case" : "schedule-next") : "reschedule-meeting";
  return { kind: "session", label: `SESSION ${session?.number ?? ""}`, detail: session?.title ?? "Session", action, session, nextSession: sessions.find((item) => item.number === (session?.number ?? 0) + 1) ?? null, meeting: currentMeeting, progress: `${session?.number ?? 0} of ${sessions.length} Sessions` };
}

export function canManageSessions(roles: readonly string[]) { return roles.some((role) => role === "campus_lead" || role === "coach" || role === "counselor"); }
