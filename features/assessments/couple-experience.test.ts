import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
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
  assignmentId: "assignment", title: "Synthetic Assessment", description: null, sessionTitle: "Session 1", status: "not_started",
  profileName: "Alex Example", attemptId: null, activeRetakeId: null, activeRetakeAnswers: {},
  questions: [question], answers: {}, results: [], history: [], partnerResults: null,
};

describe("Couple Assessment presentation", () => {
  it("shows independent assignment status and links to the participant's own assessment", () => {
    const html = renderToStaticMarkup(createElement(AssessmentList, { assessments: [
      { assignmentId: "own-assignment", title: "Love Languages", description: "Discover how you prefer to give and receive love.", sessionTitle: "testing", status: "in_progress" },
      { assignmentId: "done", title: "Completed Assessment", description: null, sessionTitle: "Session 2", status: "completed" },
      { assignmentId: "empty", title: "Unpublished", description: null, sessionTitle: "Session 1", status: "unavailable" },
    ] }));
    expect(html).toContain("In Progress");
    expect(html).toContain('href="/workspace/assessments/own-assignment"');
    expect(html).toContain("Continue Assessment");
    expect(html).toContain("View Results");
    expect(html).toContain("not available yet");
    expect(html).toContain("Discover how you prefer to give and receive love.");
    expect(html).not.toContain(">testing</p>");
    expect(html).toContain("Session 2");
    expect(html).not.toContain('id="assessments-heading"');
  });

  it("uses the generic Assessment eyebrow on results instead of a Session title", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: {
      ...assessment, title: "Love Languages", sessionTitle: "testing", status: "completed", attemptId: null,
      results: [{ label: "Words", score: 8, rank: 1, isPrimary: true }],
    } }));
    expect(html).toContain(">ASSESSMENT</p><h1");
    expect(html).toContain("Love Languages");
    expect(html).not.toContain(">testing</p>");
  });

  it("keeps the main Assessments page title and introduction without a duplicate list heading", () => {
    const page = readFileSync("app/workspace/assessments/page.tsx", "utf8");
    expect(page.match(/<h1/g)).toHaveLength(1);
    expect(page).toContain("Complete your assigned Assessments privately at your own pace.");
    expect(page).toContain("<AssessmentList assessments={assessments} />");
  });

  it("renders a single paired-choice question with progress and a disabled Next before an answer", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: { ...assessment, questions: [question, secondQuestion], attemptId: "attempt", status: "in_progress" } }));
    expect(html).toContain("Question 1 of 2");
    expect(html).toContain("Synthetic question?");
    expect(html).toContain("First option");
    expect(html).toContain("Second option");
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('class="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10"');
    expect(html).toContain('href="/workspace/assessments"');
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Next/);
    expect(html).not.toContain("Back to Review");
  });

  it("makes each accessible radio itself the full answer tile and highlights the selected tile", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: {
      ...assessment, questions: [question, secondQuestion], attemptId: "attempt", status: "in_progress", answers: { q1: "a" },
    } }));

    expect(html).toContain("Another synthetic question?");
    expect(html).toMatch(/<button type="button" role="radio"[^>]*aria-checked="false"[^>]*aria-label="Third option"[^>]*class="[^"]*cursor-pointer[^"]*border-border[^"]*"[^>]*><span aria-hidden="true"[^>]*>[\s\S]*?<\/span><span[^>]*>Third option<\/span><span[^>]*>A<\/span><\/button>/);
    expect(html).toContain("hover:border-brand-primary/50");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("disabled:cursor-not-allowed");
    const source = readFileSync("features/assessments/couple-experience.tsx", "utf8");
    expect(source).toContain('selected ? "border-brand-primary bg-brand-primary/5" : "border-border"');
    expect(source).toContain('onValueChange={(value) => choose(question.id, value)}');
    expect(source).not.toContain('onClick={() => choose(question.id');
  });

  it("renders all 30 numbered review tiles with accessible answer status and completion checks", () => {
    const questions = Array.from({ length: 30 }, (_, index) => ({
      id: `q${index + 1}`,
      position: index,
      prompt: `Question ${index + 1}?`,
      choices: [{ id: `q${index + 1}-a`, position: 0, label: "First" }, { id: `q${index + 1}-b`, position: 1, label: "Second" }],
    }));
    const answers = Object.fromEntries(questions.map((item) => [item.id, item.choices[0].id]));
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: {
      ...assessment, questions, attemptId: "attempt", status: "in_progress", answers,
    } }));

    for (let number = 1; number <= 30; number += 1) {
      expect(html).toContain(`aria-label="Question ${number}, answered"`);
      expect(html).toContain(`<span>${number}</span>`);
    }
    expect(html.match(/text-success-strong/g)).toHaveLength(30);
    expect(html).toContain("grid-cols-5 gap-2 sm:grid-cols-10");
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
    expect(html).toContain('class="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10"');
    expect(html).toContain("Continue Retake");
    expect(html).toContain("Care");
    expect(html).toContain("Partner results are shared after both partners complete their initial Assessment.");
    expect(html).toContain('class="space-y-5"');
    expect(html).not.toContain("md:grid-cols-2");
    expect(html.match(/Continue Retake/g)).toHaveLength(1);
  });

  it("shows both partners in equal responsive columns, with the signed-in partner first", () => {
    const html = renderToStaticMarkup(createElement(CoupleAssessmentExperience, { assessment: {
      ...assessment, profileName: "Alex Example", status: "completed",
      results: [{ label: "Words", score: 8, rank: 1, isPrimary: true }],
      history: [{ attemptNumber: 1, submittedAt: "2026-10-29T20:00:00.000Z", results: [{ label: "Words", score: 8, rank: 1, isPrimary: true }] }],
      partnerResults: { name: "Sam Example", submittedAt: "2026-10-30T20:00:00.000Z", results: [{ label: "Time", score: 7, rank: 1, isPrimary: true }] },
    } }));

    expect(html).toContain('class="grid gap-5 md:grid-cols-2"');
    expect(html).toContain('p-5 sm:p-7 h-full md:col-start-1 md:row-start-1');
    expect(html).toContain('p-5 sm:p-7 h-full md:col-start-2 md:row-start-1');
    expect(html).toContain('class="flex flex-wrap gap-3 md:col-start-1 md:row-start-2"');
    expect(html.indexOf("Alex Example results")).toBeLessThan(html.indexOf("Sam Example results"));
    expect(html).toContain("Completed 2026-10-29");
    expect(html).toContain("Completed 2026-10-30");
    expect(html.match(/Retake Assessment/g)).toHaveLength(1);
    expect(html.indexOf("Retake Assessment")).toBeLessThan(html.indexOf("Sam Example results"));
    expect(html.indexOf("</section>", html.indexOf("Alex Example results"))).toBeLessThan(html.indexOf("Retake Assessment"));
    expect(html.match(/Primary/g)).toHaveLength(2);
  });
});
