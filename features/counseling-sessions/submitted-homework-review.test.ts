import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Json } from "@/types/database.generated";

vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("a", props, children) }));
vi.mock("@/features/session-builder/rich-text-editor", () => ({ RichTextReadOnly: ({ content }: { content: Record<string, unknown> }) => createElement("div", { "data-rich-text": true }, JSON.stringify(content)) }));

import { SubmittedHomeworkReviewPage } from "./submitted-homework-review-page";
import { homeworkReviewAnswer, type SubmittedHomeworkReview } from "./submitted-homework-review";

const review: SubmittedHomeworkReview = {
  progressId: "progress-a",
  caseId: "case-a",
  profileId: "partner-a",
  submittedAt: "2026-10-26T18:30:00.000Z",
  sessionTitle: "Communication",
  sessionSequence: 2,
  questions: [
    { blockId: "long", type: "long_answer", position: 0, title: null, content: { text: "Long prompt" }, choices: null, isRequired: true, answerText: "I want to be heard.", answerValue: null },
    { blockId: "check", type: "checkbox_question", position: 1, title: null, content: { text: "Checkbox prompt" }, choices: [{ id: "c1", label: "Pause first" }, { id: "c2", label: "Listen closely" }], isRequired: false, answerText: "", answerValue: ["c2", "c1"] },
    { blockId: "radio", type: "radio_question", position: 2, title: null, content: { text: "Radio prompt" }, choices: [{ id: "r1", label: "Calm" }, { id: "r2", label: "Hopeful" }], isRequired: true, answerText: "", answerValue: "r2" },
    { blockId: "optional", type: "checkbox_question", position: 3, title: null, content: { text: "Optional prompt" }, choices: [{ id: "o1", label: "Walk" }, { id: "o2", label: "Write" }], isRequired: false, answerText: "", answerValue: [] },
  ],
};

describe("submitted Homework review presentation", () => {
  it("maps saved option IDs to the pinned option labels and preserves answer text", () => {
    expect(homeworkReviewAnswer(review.questions[0])).toEqual(["I want to be heard."]);
    expect(homeworkReviewAnswer(review.questions[1])).toEqual(["Listen closely", "Pause first"]);
    expect(homeworkReviewAnswer(review.questions[2])).toEqual(["Hopeful"]);
    expect(homeworkReviewAnswer(review.questions[3])).toEqual([]);
    const invalidChoice = { ...review.questions[2], answerValue: "missing" as Json };
    expect(homeworkReviewAnswer(invalidChoice)).toEqual([]);
  });

  it("shows the partner, assigned Session, submission date, ordered questions, and read-only answers", () => {
    const markup = renderToStaticMarkup(createElement(SubmittedHomeworkReviewPage, { review, partnerName: "Partner A" }));
    expect(markup).toContain("Partner A");
    expect(markup).toContain("Session 2: Communication");
    expect(markup).toContain("Submitted October 26, 2026");
    expect(markup).toContain("I want to be heard.");
    expect(markup).toContain("Listen closely");
    expect(markup).toContain("Pause first");
    expect(markup).toContain("Hopeful");
    expect(markup).toContain("No answer provided");
    expect(markup.indexOf("Long prompt")).toBeLessThan(markup.indexOf("Checkbox prompt"));
    expect(markup.indexOf("Checkbox prompt")).toBeLessThan(markup.indexOf("Radio prompt"));
    expect(markup.indexOf("Radio prompt")).toBeLessThan(markup.indexOf("Optional prompt"));
    expect(markup).toContain('href="/workspace/cases/case-a"');
    expect(markup).toContain("Back to Counseling Case");
    expect(markup).not.toMatch(/<(form|textarea|input|button)\b/);
    expect(markup).not.toContain("Grade");
    expect(markup).not.toContain("Feedback");
  });
});
