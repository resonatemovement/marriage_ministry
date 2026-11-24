import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Json } from "@/types/database.generated";
import { sideBySideAnswerColumn, sideBySideResponseMetadata } from "@/features/homework/side-by-side-response";

vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("a", props, children) }));
vi.mock("@/features/session-builder/rich-text-editor", () => ({ RichTextReadOnly: ({ content, contentClassName }: { content: Record<string, unknown>; contentClassName?: string }) => createElement("div", { className: contentClassName, "data-rich-text": true }, JSON.stringify(content)) }));

import { SubmittedHomeworkReviewPage } from "./submitted-homework-review-page";
import { homeworkReviewAnswer, type SubmittedHomeworkReview } from "./submitted-homework-review";

const review: SubmittedHomeworkReview = {
  progressId: "progress-a",
  caseId: "case-a",
  profileId: "partner-a",
  submittedAt: "2026-10-26T18:30:00.000Z",
  sessionTitle: "Communication",
  sessionSequence: 2,
  pages: [{ id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 }],
  questions: [
    { blockId: "long", type: "long_answer", position: 0, title: null, content: { text: "Long prompt" }, choices: null, isRequired: true, answerText: "I want to be heard.", answerValue: null },
    { blockId: "check", type: "checkbox_question", position: 1, title: null, content: { text: "Checkbox prompt" }, choices: [{ id: "c1", label: "Pause first" }, { id: "c2", label: "Listen closely" }], isRequired: false, answerText: "", answerValue: ["c2", "c1"] },
    { blockId: "radio", type: "radio_question", position: 2, title: null, content: { text: "Radio prompt" }, choices: [{ id: "r1", label: "Calm" }, { id: "r2", label: "Hopeful" }], isRequired: true, answerText: "", answerValue: "r2" },
    { blockId: "optional", type: "checkbox_question", position: 3, title: null, content: { text: "Optional prompt" }, choices: [{ id: "o1", label: "Walk" }, { id: "o2", label: "Write" }], isRequired: false, answerText: "", answerValue: [] },
  ],
};

describe("submitted Homework review presentation", () => {
  it("uses a 12px title-to-content gap for titled review prompts", () => {
    const question = { ...review.questions[0], title: "Question heading" };
    const markup = renderToStaticMarkup(createElement(SubmittedHomeworkReviewPage, {
      review: { ...review, questions: [question] }, partnerName: "Partner A",
    }));

    expect(markup).toContain('<div class="grid gap-3"><h2 class="font-heading text-lg font-bold text-text-primary">Question heading</h2><div class="p-0" data-rich-text="true">');
    expect(markup).toContain("Long prompt");
  });

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
    expect(markup).toContain("Workspace");
    expect(markup).toContain("Counseling Case");
    expect(markup).toContain("Homework Answers");
    expect(markup).toContain('href="/workspace/cases/case-a"');
    expect(markup).not.toContain("Back to Counseling Case");
    expect(markup).not.toMatch(/<(form|textarea|input|button)\b/);
    expect(markup).not.toContain("Grade");
    expect(markup).not.toContain("Feedback");
  });

  it("reviews each response under its published heading in responsive read-only columns", () => {
    const config = { groupId: "stable-pair", instructions: "Use the prompts to reflect.", leftHeading: "Recognize and Renounce", rightHeading: "Replace and Renew", bothRequired: true };
    const sideBySideQuestions = [
      { blockId: "left-id", type: "long_answer" as const, position: 4, title: config.leftHeading, content: { type: "doc", content: [] }, choices: null, isRequired: true, answerText: "Name what happened.\nThen what it affected.", answerValue: null, description: sideBySideResponseMetadata({ ...config, side: "left" as const }) },
      { blockId: "right-id", type: "long_answer" as const, position: 5, title: config.rightHeading, content: { type: "doc", content: [] }, choices: null, isRequired: true, answerText: "I will listen more.", answerValue: null, description: sideBySideResponseMetadata({ ...config, side: "right" as const }) },
    ];
    const markup = renderToStaticMarkup(createElement(SubmittedHomeworkReviewPage, { review: { ...review, questions: [...review.questions, ...sideBySideQuestions] }, partnerName: "Partner A" }));
    expect(markup).toContain("Recognize and Renounce");
    expect(markup).toContain("Replace and Renew");
    expect(markup).toContain("Name what happened.\nThen what it affected.");
    expect(markup).toContain("I will listen more.");
    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain(">Recognize and Renounce</h2>");
    expect(markup.match(/>Recognize and Renounce<\/h2>/g)).toHaveLength(1);
    expect(markup.match(/>Replace and Renew<\/h2>/g)).toHaveLength(1);
    expect(markup).not.toContain("md:sr-only");
    expect(markup).not.toMatch(/<(textarea|input|button)\b/);
    expect(markup.indexOf("Recognize and Renounce")).toBeLessThan(markup.indexOf("Replace and Renew"));
  });

  it("renders multiple saved answer pairs in aligned responsive columns without row numbering or controls", () => {
    const config = { groupId: "ab29786c-cc70-4b39-9f75-8640aa0872f7", instructions: "Reflect on both sides.", leftHeading: "Notice", rightHeading: "Choose", bothRequired: true, responseMode: "paired_rows_v1" as const };
    const rows = [
      { id: "a555f2d8-84ce-44ca-9de8-2d6babaf994e", left: "First line\nSecond line", right: "Short response" },
      { id: "b5edf42b-9646-41a9-9fc0-996e2a6833c4", left: "Longer response\nwith another line\nand more context", right: "Second pair" },
    ];
    const questions = (["left", "right"] as const).map((side, index) => ({
      blockId: `paired-${side}`, type: "long_answer" as const, position: 4 + index, title: side === "left" ? config.leftHeading : config.rightHeading,
      content: { type: "doc", content: [] }, choices: null, isRequired: true, answerText: sideBySideAnswerColumn(rows, side), answerValue: null,
      description: sideBySideResponseMetadata({ ...config, side }),
    }));
    const markup = renderToStaticMarkup(createElement(SubmittedHomeworkReviewPage, { review: { ...review, questions: [...review.questions, ...questions] }, partnerName: "Partner A" }));
    expect(markup).toContain("First line\nSecond line");
    expect(markup).toContain("Longer response\nwith another line\nand more context");
    expect(markup).toContain("Short response");
    expect(markup).toContain("Second pair");
    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain("items-stretch");
    expect(markup).toContain('class="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border"');
    expect(markup).toContain('class="mb-3 grid grid-cols-2 gap-2 border-b border-border pb-3 sm:gap-4"');
    expect(markup).toContain('class="min-w-0 px-1 sm:px-3"');
    expect(markup.match(/>Notice<\/h2>/g)).toHaveLength(1);
    expect(markup.match(/>Choose<\/h2>/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<div class="grid min-w-0 items-stretch[^\"]*border/);
    expect(markup).not.toMatch(/\b(?:Pair|Row)\s*\d+/);
    expect(markup).not.toContain("Add response");
    expect(markup).not.toMatch(/<(textarea|input|button)\b/);
  });
});
