import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./homework-participant-actions", () => ({ persistParticipantHomework: vi.fn() }));

import { ParticipantHomeworkContent, participantAnswersAreDirty, participantAnswerValues, participantRequiredAnswerErrors } from "./homework-participant";

const participantSource = readFileSync("features/couple-workspace/homework-participant.tsx", "utf8");

describe("participant Homework presentation", () => {
  it("uses compact Rich Text and naturally sized outer blocks", () => {
    expect(participantSource.match(/compact \/>/g)).toHaveLength(2);
    expect(participantSource).toContain('<Card key={block.id} className="p-5 sm:p-7">');
    expect(participantSource).not.toContain('className="min-h-40');
  });

  it("keeps the response controls close, resizable, and comfortably sized", () => {
    expect(participantSource).toContain('>Your response <span className="font-normal text-text-muted">(required)</span></label>');
    expect(participantSource).toContain('rows={5}');
    expect(participantSource).toContain('className="mt-2 min-h-32 w-full resize-y');
    expect(participantSource).not.toContain("Save response");
    expect(participantSource).toContain("Save Draft");
    expect(participantSource).toContain("Submit Homework");
    expect(participantSource).toContain("persistParticipantHomework");
  });

  it("uses one assignment form and one action pair for multiple Long Answers", () => {
    const homework = { title: "Testing Homework", status: "in_progress" as const, progressId: "own-progress", blocks: [
      { id: "one", type: "long_answer", title: null, content: { type: "doc", content: [] }, url: null, description: null, answer: "Saved one" },
      { id: "two", type: "long_answer", title: null, content: { type: "doc", content: [] }, url: null, description: null, answer: "" },
    ] };
    const html = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework }));
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html.match(/Save Draft/g)).toHaveLength(1);
    expect(html.match(/Submit Homework/g)).toHaveLength(1);
    expect(html).not.toContain("Save response");
    expect(html).toContain("Saved one");
    expect(html).toContain('name="answer-one"');
    expect(html).toContain('name="answer-two"');
  });

  it("tracks all answer values, dirty state, and required errors together", () => {
    const homework = { title: "Testing Homework", status: "not_started" as const, progressId: "own-progress", blocks: [
      { id: "instructions", type: "rich_text", title: "Read", content: {}, url: null, description: null, answer: "" },
      { id: "one", type: "long_answer", title: null, content: {}, url: null, description: null, answer: "Saved" },
      { id: "two", type: "long_answer", title: null, content: {}, url: null, description: null, answer: "" },
    ] };
    expect(participantAnswerValues(homework)).toEqual({ one: "Saved", two: "" });
    expect(participantAnswersAreDirty({ one: "Saved", two: "New" }, { one: "Saved", two: "" })).toBe(true);
    expect(participantAnswersAreDirty({ one: "Saved", two: "" }, { one: "Saved", two: "" })).toBe(false);
    expect(participantRequiredAnswerErrors({ one: "Saved", two: "  " })).toEqual({ two: "A response is required." });
  });

  it("warns only while assignment answers are dirty", () => {
    expect(participantSource).toContain('if (!dirty) return;');
    expect(participantSource).toContain('window.addEventListener("beforeunload"');
    expect(participantSource).toContain("eligibleInternalNavigation");
    expect(participantSource).toContain('setSavedAnswers({ ...answers })');
  });

  it("renders no assignment actions for submitted or missing Homework", () => {
    const submitted = { title: "Testing Homework", status: "submitted" as const, progressId: "own-progress", blocks: [
      { id: "one", type: "long_answer", title: null, content: {}, url: null, description: null, answer: "Done" },
    ] };
    const submittedHtml = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: submitted }));
    expect(submittedHtml).toContain("Submitted Homework is read-only.");
    expect(submittedHtml).not.toContain("Save Draft");
    expect(submittedHtml).not.toContain("Submit Homework");
    const emptyHtml = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: null, emptyTitle: "No Homework for this Session" }));
    expect(emptyHtml).toContain("No Homework for this Session");
    expect(emptyHtml).not.toContain("Save Draft");
    expect(emptyHtml).not.toContain("Submit Homework");
  });

  it("keeps the dedicated Session and legacy Homework routes on the same participant renderer", () => {
    const sessionView = readFileSync("features/couple-workspace/session-view.tsx", "utf8");
    const homeworkPage = readFileSync("app/workspace/homework/page.tsx", "utf8");
    expect(sessionView).toContain("<ParticipantHomeworkContent");
    expect(sessionView).toContain("showHeader={false}");
    expect(participantSource).toContain("<ParticipantHomeworkContent homework={homework}");
    expect(homeworkPage).toContain("HomeworkParticipantPage homework={homework}");
  });

  it("can omit its duplicate heading on Session View while keeping it on the legacy Homework page", () => {
    const homework = { title: "Testing Homework", status: "in_progress" as const, progressId: "own-progress", blocks: [] };
    const sessionMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework, readOnly: true, showHeader: false }));
    expect(sessionMarkup).not.toContain("Session Homework");
    expect(sessionMarkup).not.toContain("Testing Homework");
    const legacyMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework, readOnly: true }));
    expect(legacyMarkup).toContain("Session Homework");
    expect(legacyMarkup).toContain("Testing Homework");
    expect(legacyMarkup).toContain("Status:");
  });
});
