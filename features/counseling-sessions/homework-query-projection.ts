import type { HomeworkProgressStatus } from "@/features/homework/presentation";

type HomeworkProgressRow = { id: string; profile_id: string; status: HomeworkProgressStatus };
type HomeworkRevisionRow = {
  id: string;
  ended_at: string | null;
  homework_participant_progress: HomeworkProgressRow[] | null;
};
type HomeworkAssignmentRow = {
  counseling_case_id: string;
  homework_assignment_revisions: HomeworkRevisionRow[] | null;
};
type PinnedCaseSession = {
  counselingCaseId: string;
  sessionId: string;
  homeworkAssignmentRevisionId: string | null;
};

export type CounselingHomeworkProgress = {
  sessionId: string;
  complete: boolean;
  progress: { progressId: string; profileId: string; status: HomeworkProgressStatus }[];
};

export function projectCounselingHomeworkProgress(
  assignments: readonly HomeworkAssignmentRow[],
  caseSessions: readonly PinnedCaseSession[],
) {
  const pinnedRevisions = new Map<string, PinnedCaseSession>();
  for (const caseSession of caseSessions) {
    if (caseSession.homeworkAssignmentRevisionId) {
      pinnedRevisions.set(caseSession.homeworkAssignmentRevisionId, caseSession);
    }
  }

  const progressByCase = new Map<string, { sessionId: string; complete: boolean }[]>();
  const homeworkByRevision = new Map<string, CounselingHomeworkProgress>();

  for (const assignment of assignments) {
    for (const revision of assignment.homework_assignment_revisions ?? []) {
      if (revision.ended_at !== null) continue;

      const pinnedSession = pinnedRevisions.get(revision.id);
      if (!pinnedSession || pinnedSession.counselingCaseId !== assignment.counseling_case_id) continue;

      const progress = revision.homework_participant_progress ?? [];
      const complete = progress.length === 2 && progress.every(({ status }) => status === "submitted" || status === "reviewed");
      const caseProgress = progressByCase.get(assignment.counseling_case_id) ?? [];
      caseProgress.push({ sessionId: pinnedSession.sessionId, complete });
      progressByCase.set(assignment.counseling_case_id, caseProgress);

      homeworkByRevision.set(revision.id, {
        sessionId: pinnedSession.sessionId,
        complete,
        progress: progress.flatMap(({ id, profile_id, status }) => id && profile_id ? [{ progressId: id, profileId: profile_id, status }] : []),
      });
    }
  }

  return { progressByCase, homeworkByRevision };
}
