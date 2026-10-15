import type { SessionSummary } from "./types";

export function withAuthoredSessionNumbers<T extends { sequenceNumber: number }>(sessions: readonly T[]) {
  return [...sessions]
    .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
    .map((session, index) => ({ ...session, authoredSessionNumber: index + 1 }));
}

export function withCurriculumNumbers(sessions: SessionSummary[]): SessionSummary[] {
  return withAuthoredSessionNumbers(sessions).map(({ authoredSessionNumber, ...session }) => ({
    ...session,
    curriculumNumber: authoredSessionNumber,
  }));
}
