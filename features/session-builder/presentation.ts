import type { SessionSummary } from "./types";

export function withCurriculumNumbers(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.map((session, index) => ({ ...session, curriculumNumber: index + 1 }));
}
