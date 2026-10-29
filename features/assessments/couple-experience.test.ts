import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./couple-actions", () => ({
  startCoupleAssessment: vi.fn(), saveCoupleAssessmentResponse: vi.fn(), submitCoupleAssessment: vi.fn(),
}));

import { AssessmentList, AssessmentResults, CoupleAssessmentExperience } from "./couple-experience";
import type { CoupleAssessmentData } from "./couple-queries";

const question = { id: "q1", position: 0, prompt: "Synthetic question?", choices: [{ id: "a", position: 0, label: "First option" }, { id: "b", position: 1, label: "Second option" }] };
const secondQuestion = { id: "q2", position: 1, prompt: "Another synthetic question?", choices: [{ id: "c", position: 0, label: "Third option" }, { id: "d", position: 1, label: "Fourth option" }] };
const assessment: CoupleAssessmentData = {
  assignmentId: "assignment", title: "Synthetic Assessment", sessionTitle: "Session 1", status: "not_started",
  attemptId: null, questions: [question], answers: {}, results: [],
};

describe("Couple Assessment presentation", () => {
  it("shows independent assignment status and links to the participant's own assessment", () => {
    const html = renderToStaticMarkup(createElement(AssessmentList, { assessments: [
      { assignmentId: "own-assignment", title: "Love Languages", sessionTitle: "Session 1", status: "in_progress" },
      { assignmentId: "done", title: "Completed Assessment", sessionTitle: "Session 2", status: "completed" },
      { assignmentId: "empty", title: "Unpublished", sessionTitle: "Session 1", status: "unavailable" },
    ] }));
    expect(html).toContain("In Progress");
    expect(html).toContain('href="/workspace/assessments/own-assignment"');
    expect(html).toContain("Continue Assessment");
    expect(html).toContain("View Results");
    expect(html).toContain("not available yet");
  });

  it("renders a single paired-choice question with progress and a disabled Next before an answer", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: { ...assessment, questions: [question, secondQuestion], attemptId: "attempt", status: "in_progress" } }));
    expect(html).toContain("Question 1 of 2");
    expect(html).toContain("Synthetic question?");
    expect(html).toContain("First option");
    expect(html).toContain("Second option");
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Next/);
  });

  it("renders an unavailable state instead of exposing an empty draft questionnaire", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: { ...assessment, status: "unavailable", questions: [] } }));
    expect(html).toContain("Assessment unavailable");
    expect(html).toContain("does not have published questions yet");
    expect(html).not.toContain("Begin Assessment");
  });

  it("renders server scores from highest to lowest and marks tied primary results", () => {
    const html = renderToStaticMarkup(createElement(AssessmentResults, { results: [
      { label: "Connection", score: 5, rank: 2, isPrimary: false },
      { label: "Care", score: 7, rank: 1, isPrimary: true },
      { label: "Time", score: 7, rank: 1, isPrimary: true },
    ] }));
    expect(html.indexOf("Care")).toBeLessThan(html.indexOf("Time"));
    expect(html.indexOf("Time")).toBeLessThan(html.indexOf("Connection"));
    expect(html.match(/Primary/g)).toHaveLength(2);
    expect(html).toContain("Only your results are shown here.");
  });
});
