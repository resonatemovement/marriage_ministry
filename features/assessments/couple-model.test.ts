import { describe, expect, it } from "vitest";

import { assessmentCanSubmit, assessmentResumeIndex, assessmentResultsAreAvailable, assessmentResultsInDisplayOrder, assessmentStatus, nextAssessmentQuestionIndex, previousAssessmentQuestionIndex, type CoupleAssessmentQuestion } from "./couple-model";

const questions: CoupleAssessmentQuestion[] = [
  { id: "q1", position: 0, prompt: "One?", choices: [{ id: "a", position: 0, label: "A" }, { id: "b", position: 1, label: "B" }] },
  { id: "q2", position: 1, prompt: "Two?", choices: [{ id: "c", position: 0, label: "C" }, { id: "d", position: 1, label: "D" }] },
  { id: "q3", position: 2, prompt: "Three?", choices: [{ id: "e", position: 0, label: "E" }, { id: "f", position: 1, label: "F" }] },
];

describe("Couple Assessment experience model", () => {
  it("maps assignment state to participant-facing status and hides unusable drafts", () => {
    expect(assessmentStatus(null, true)).toBe("not_started");
    expect(assessmentStatus({ status: "in_progress" }, true)).toBe("in_progress");
    expect(assessmentStatus({ status: "submitted" }, true)).toBe("completed");
    expect(assessmentStatus({ status: "submitted" }, false)).toBe("unavailable");
  });

  it("shows authoritative results immediately after submission before refreshed server props arrive", () => {
    expect(assessmentResultsAreAvailable("in_progress", "attempt-1", false)).toBe(false);
    expect(assessmentResultsAreAvailable("in_progress", null, true)).toBe(true);
    expect(assessmentResultsAreAvailable("completed", null, false)).toBe(true);
    expect(assessmentResultsAreAvailable("completed", "retake-1", false)).toBe(false);
  });

  it("resumes at the question after the last saved response and sends a complete attempt to review", () => {
    expect(assessmentResumeIndex(questions, {})).toBe(0);
    expect(assessmentResumeIndex(questions, { q1: "a" })).toBe(1);
    expect(assessmentResumeIndex(questions, { q1: "a", q2: "c" })).toBe(2);
    expect(assessmentResumeIndex(questions, { q1: "a", q2: "c", q3: "e" })).toBe(2);
  });

  it("requires every response and prevents submission while save or submit is pending", () => {
    expect(assessmentCanSubmit(questions, { q1: "a", q2: "c" }, false, false)).toBe(false);
    const complete = { q1: "a", q2: "c", q3: "e" };
    expect(assessmentCanSubmit(questions, complete, false, false)).toBe(true);
    expect(assessmentCanSubmit(questions, complete, true, false)).toBe(false);
    expect(assessmentCanSubmit(questions, complete, false, true)).toBe(false);
  });

  it("keeps question navigation within bounds", () => {
    expect(nextAssessmentQuestionIndex(0, 3)).toBe(1);
    expect(nextAssessmentQuestionIndex(2, 3)).toBe(2);
    expect(previousAssessmentQuestionIndex(2, 3)).toBe(1);
    expect(previousAssessmentQuestionIndex(0, 3)).toBe(0);
  });

  it("sorts server-calculated results by score and retains every tied primary", () => {
    const display = assessmentResultsInDisplayOrder([
      { label: "Words", score: 8, rank: 2, isPrimary: false },
      { label: "Time", score: 11, rank: 1, isPrimary: true },
      { label: "Gifts", score: 11, rank: 1, isPrimary: true },
    ]);
    expect(display.map(({ label }) => label)).toEqual(["Gifts", "Time", "Words"]);
    expect(display.filter(({ isPrimary }) => isPrimary)).toHaveLength(2);
  });

  it("orders all five server-calculated Love Languages scores and preserves tied primary categories", () => {
    const display = assessmentResultsInDisplayOrder([
      { label: "Touch", score: 6, rank: 4, isPrimary: false },
      { label: "Time", score: 12, rank: 1, isPrimary: true },
      { label: "Words", score: 3, rank: 5, isPrimary: false },
      { label: "Gifts", score: 12, rank: 1, isPrimary: true },
      { label: "Service", score: 9, rank: 3, isPrimary: false },
    ]);
    expect(display.map((result) => result.score)).toEqual([12, 12, 9, 6, 3]);
    expect(display.filter((result) => result.isPrimary).map((result) => result.label).sort()).toEqual(["Gifts", "Time"]);
  });
});
