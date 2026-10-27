import { describe, expect, it } from "vitest";

import { projectCounselingHomeworkProgress } from "./homework-query-projection";

const pinnedSession = {
  counselingCaseId: "case-a",
  sessionId: "session-1",
  homeworkAssignmentRevisionId: "revision-a",
};

describe("projectCounselingHomeworkProgress", () => {
  it("projects both partners when the RLS-hidden Homework template relation is null", () => {
    const assignment = {
      counseling_case_id: "case-a",
      homework: null,
      homework_assignment_revisions: [{
        id: "revision-a",
        ended_at: null,
        homework_participant_progress: [
          { id: "progress-a", profile_id: "partner-a", status: "not_started" as const },
          { id: "progress-b", profile_id: "partner-b", status: "not_started" as const },
        ],
      }],
    };

    const projected = projectCounselingHomeworkProgress([assignment], [pinnedSession]);

    expect(projected.homeworkByRevision.get("revision-a")).toEqual({
      sessionId: "session-1",
      complete: false,
      progress: [
        { progressId: "progress-a", profileId: "partner-a", status: "not_started" },
        { progressId: "progress-b", profileId: "partner-b", status: "not_started" },
      ],
    });
    expect(projected.progressByCase.get("case-a")).toEqual([{ sessionId: "session-1", complete: false }]);
  });

  it("preserves each partner status independently and requires both to submit or be reviewed", () => {
    const assignment = {
      counseling_case_id: "case-a",
      homework_assignment_revisions: [{
        id: "revision-a",
        ended_at: null,
        homework_participant_progress: [
          { id: "progress-a", profile_id: "partner-a", status: "in_progress" as const },
          { id: "progress-b", profile_id: "partner-b", status: "submitted" as const },
        ],
      }],
    };

    const inProgress = projectCounselingHomeworkProgress([assignment], [pinnedSession]).homeworkByRevision.get("revision-a");
    expect(inProgress?.progress).toEqual([
      { progressId: "progress-a", profileId: "partner-a", status: "in_progress" },
      { progressId: "progress-b", profileId: "partner-b", status: "submitted" },
    ]);
    expect(inProgress?.complete).toBe(false);

    const completeAssignment = {
      ...assignment,
      homework_assignment_revisions: [{
        ...assignment.homework_assignment_revisions[0],
        homework_participant_progress: [
          { id: "progress-a", profile_id: "partner-a", status: "submitted" as const },
          { id: "progress-b", profile_id: "partner-b", status: "reviewed" as const },
        ],
      }],
    };
    const complete = projectCounselingHomeworkProgress([completeAssignment], [pinnedSession]).homeworkByRevision.get("revision-a");
    expect(complete?.complete).toBe(true);
  });

  it("does not associate unrelated, ended, or other-case revisions with a pinned Session", () => {
    const assignments = [
      { counseling_case_id: "case-a", homework_assignment_revisions: [{ id: "revision-other", ended_at: null, homework_participant_progress: [{ id: "p1", profile_id: "other", status: "submitted" as const }] }] },
      { counseling_case_id: "case-b", homework_assignment_revisions: [{ id: "revision-a", ended_at: null, homework_participant_progress: [{ id: "p2", profile_id: "other", status: "submitted" as const }] }] },
      { counseling_case_id: "case-a", homework_assignment_revisions: [{ id: "revision-ended", ended_at: "2026-10-01T00:00:00Z", homework_participant_progress: [{ id: "p3", profile_id: "other", status: "submitted" as const }] }] },
      { counseling_case_id: "case-a", homework_assignment_revisions: [{ id: "revision-unpinned", ended_at: null, homework_participant_progress: [{ id: "p4", profile_id: "other", status: "submitted" as const }] }] },
    ];

    const projected = projectCounselingHomeworkProgress(assignments, [pinnedSession]);

    expect(projected.homeworkByRevision.size).toBe(0);
    expect(projected.progressByCase.size).toBe(0);
  });

  it("keeps historical revision data tied to its own pinned Session and treats missing progress as incomplete", () => {
    const assignments = [{
      counseling_case_id: "case-a",
      homework_assignment_revisions: [
        { id: "revision-a", ended_at: null, homework_participant_progress: null },
        { id: "revision-history", ended_at: null, homework_participant_progress: [{ id: "progress-history", profile_id: "partner-a", status: "submitted" as const }] },
      ],
    }];
    const pinnedSessions = [
      pinnedSession,
      { counselingCaseId: "case-a", sessionId: "session-history", homeworkAssignmentRevisionId: "revision-history" },
    ];

    const projected = projectCounselingHomeworkProgress(assignments, pinnedSessions);

    expect(projected.homeworkByRevision.get("revision-a")).toEqual({ sessionId: "session-1", complete: false, progress: [] });
    expect(projected.homeworkByRevision.get("revision-history")).toEqual({ sessionId: "session-history", complete: false, progress: [{ progressId: "progress-history", profileId: "partner-a", status: "submitted" }] });
  });
});
