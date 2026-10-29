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
  profileName: "Alex Example", attemptId: null, activeRetakeId: null, activeRetakeAnswers: {},
  questions: [question], answers: {}, results: [], history: [], partnerResults: null,
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
    expect(html).toContain("7");
    expect(html).toContain("/ 12");
  });

  it("shows each partner's current result and keeps the user's completed-attempt history personal", () => {
    const ownHistory = [
      { attemptNumber: 2, submittedAt: "2026-10-29T20:00:00.000Z", results: [{ label: "Time", score: 8, rank: 1, isPrimary: true }] },
      { attemptNumber: 1, submittedAt: "2026-10-28T20:00:00.000Z", results: [{ label: "Words", score: 7, rank: 1, isPrimary: true }] },
    ];
    const own = renderToStaticMarkup(createElement(AssessmentResults, { name: "Alex Example", results: ownHistory[0].results, history: ownHistory }));
    const partner = renderToStaticMarkup(createElement(AssessmentResults, { name: "Sam Example", results: [{ label: "Care", score: 9, rank: 1, isPrimary: true }], submittedAt: "2026-10-28T21:00:00.000Z" }));
    expect(own).toContain("Alex Example results");
    expect(own).toContain("Your completed attempts");
    expect(own).toContain("Attempt 1");
    expect(own).toContain("Attempt 2");
    expect(own).toContain("Completed 2026-10-29");
    expect(partner).toContain("Sam Example results");
    expect(partner).not.toContain("Your completed attempts");
    expect(partner).not.toContain("Attempt 1");
  });

  it("offers a retake or resume action without replacing the latest result while a retake is open", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: {
      ...assessment, status: "completed", results: [{ label: "Care", score: 9, rank: 1, isPrimary: true }],
      history: [{ attemptNumber: 1, submittedAt: "2026-10-28T21:00:00.000Z", results: [{ label: "Care", score: 9, rank: 1, isPrimary: true }] }],
      activeRetakeId: "unfinished-retake", activeRetakeAnswers: { q1: "a" },
    } }));
    expect(html).toContain("Continue Retake");
    expect(html).toContain("Care");
    expect(html).toContain("Partner results are shared after both partners complete their initial Assessment.");
  });
});
