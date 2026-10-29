import { describe, expect, it } from "vitest";

import { assessmentBlocksSessionAdvancement, projectCounselorAssessmentPartners } from "./counselor-management-model";

const partners = [{ id: "a", name: "Alex A" }, { id: "b", name: "Blake B" }];

describe("Counselor Assessment projections", () => {
  it("keeps partner status independent and uses only completed attempt results", () => {
    const projected = projectCounselorAssessmentPartners(partners, {
      assignments: [{ id: "assignment-a", profileId: "a", scheduleId: "schedule-1" }],
      attempts: [
        { id: "initial-a", assignmentId: "assignment-a", profileId: "a", attemptNumber: 1, status: "submitted", submittedAt: "2026-10-01T00:00:00Z" },
        { id: "retake-a", assignmentId: "assignment-a", profileId: "a", attemptNumber: 2, status: "in_progress", submittedAt: null },
      ],
      scores: [
        { attemptId: "initial-a", categoryId: "words", score: 12, rank: 1, isPrimary: true },
        { attemptId: "initial-a", categoryId: "time", score: 12, rank: 1, isPrimary: true },
      ],
      categories: [{ id: "words", label: "Words" }, { id: "time", label: "Quality Time" }],
    });

    expect(projected.map(({ profileId, status }) => [profileId, status])).toEqual([["a", "completed"], ["b", "not_assigned"]]);
    expect(projected[0]?.latestScores).toEqual([
      { label: "Words", score: 12, rank: 1, isPrimary: true },
      { label: "Quality Time", score: 12, rank: 1, isPrimary: true },
    ]);
    expect(projected[0]?.history).toHaveLength(1);
    expect(JSON.stringify(projected)).not.toMatch(/response|choiceId|scoringKey/i);
  });

  it("marks incomplete initial attempts separately from not-started assignments", () => {
    const projected = projectCounselorAssessmentPartners(partners, {
      assignments: [{ id: "assignment-a", profileId: "a" }, { id: "assignment-b", profileId: "b" }],
      attempts: [{ id: "attempt-a", assignmentId: "assignment-a", profileId: "a", attemptNumber: 1, status: "in_progress", submittedAt: null }],
      scores: [],
      categories: [],
    });
    expect(projected.map(({ status }) => status)).toEqual(["in_progress", "not_started"]);
  });

  it("identifies the active scheduled Session gate without treating retakes as completion", () => {
    const schedule = { id: "schedule-1", sessionId: "session-1", caseSessionId: "case-session-1", progressionCaseSessionId: "case-session-1", requiredForProgression: true, source: "system_default" };
    expect(assessmentBlocksSessionAdvancement({ schedule, partners: [{ profileId: "a", name: "A", status: "completed", latestScores: [], history: [] }, { profileId: "b", name: "B", status: "in_progress", latestScores: [], history: [] }] }, "case-session-1")).toBe(true);
    expect(assessmentBlocksSessionAdvancement({ schedule, partners: [{ profileId: "a", name: "A", status: "completed", latestScores: [], history: [] }, { profileId: "b", name: "B", status: "completed", latestScores: [], history: [] }] }, "case-session-1")).toBe(false);
    expect(assessmentBlocksSessionAdvancement({ schedule, partners: [] }, "other-session")).toBe(false);
  });
});
