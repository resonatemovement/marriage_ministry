import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./homework-participant-actions", () => ({ persistParticipantHomework: vi.fn() }));
vi.mock("@/features/session-builder/rich-text-editor", async () => {
  const React = await import("react");
  return {
    RichTextReadOnly: ({ content, contentClassName }: { content: Record<string, unknown>; contentClassName?: string }) =>
      React.createElement("div", { className: contentClassName, "data-rich-text": true }, JSON.stringify(content)),
  };
});

import {
  ParticipantHomeworkContent,
  nextCheckboxAnswer,
  nextRadioAnswer,
  participantAnswersAreDirty,
  participantAnswerValues,
  participantMissingRequirements,
  participantRequiredAnswerErrors,
  type ParticipantHomework,
  type ParticipantHomeworkBlock,
} from "./homework-participant";

const participantSource = readFileSync("features/couple-workspace/homework-participant.tsx", "utf8");
const choices = [
  { id: "choice-one", label: "Communication" },
  { id: "choice-two", label: "Trust" },
  { id: "choice-three", label: "Finances" },
];
const content = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const block = (override: Partial<ParticipantHomeworkBlock>): ParticipantHomeworkBlock => ({
  id: "block",
  type: "long_answer",
  title: null,
  content: content("Question"),
  url: null,
  description: null,
  answer: "",
  questionChoices: [],
  isRequired: true,
  ...override,
});
const homework = (blocks: ParticipantHomeworkBlock[], status: ParticipantHomework["status"] = "in_progress"): ParticipantHomework => ({
  title: "Testing Homework",
  status,
  progressId: "own-progress",
  revisionId: "revision-1",
  blocks,
});

describe("participant Homework presentation", () => {
  it("uses compact Rich Text and naturally sized outer blocks", () => {
    expect(participantSource).toContain('<Card key={block.id} className="p-5">');
    expect(participantSource).not.toContain('className="min-h-40');
    expect(participantSource).toContain('compact contentClassName="p-0" />');
  });

  it("spaces titled Couple Homework Rich Text by 12px without adding inner padding", () => {
    const markup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, {
      homework: homework([block({ id: "reading", type: "rich_text", title: "Read this", content: content("Rich text body") })]),
    }));
    expect(markup).toContain('<div class="grid gap-3"><h3 class="font-heading text-lg font-bold text-text-primary">Read this</h3><div class="p-0" data-rich-text="true">');
    expect(markup).toContain("Rich text body");
  });

  it("keeps Long Answer controls close, resizable, and comfortably sized", () => {
    expect(participantSource).toContain('>Your response <span className="font-normal text-text-muted">(required)</span></label>');
    expect(participantSource).toContain("rows={5}");
    expect(participantSource).toContain('className="mt-2 min-h-32 w-full resize-y');
    expect(participantSource).not.toContain("Save response");
    expect(participantSource).toContain("Save Draft");
    expect(participantSource).toContain("Submit Homework");
  });

  it("renders Checkbox and Radio prompts before vertically ordered choices", () => {
    const rendered = renderToStaticMarkup(createElement(ParticipantHomeworkContent, {
      homework: homework([
        block({ id: "checkbox", type: "checkbox_question", content: content("What would you improve?"), questionChoices: choices }),
        block({ id: "radio", type: "radio_question", content: content("How often?"), questionChoices: choices }),
      ]),
    }));
    expect(rendered.indexOf("What would you improve?")).toBeLessThan(rendered.indexOf("Communication"));
    expect(rendered.indexOf("Communication")).toBeLessThan(rendered.indexOf("Trust"));
    expect(rendered.indexOf("Trust")).toBeLessThan(rendered.indexOf("Finances"));
    expect(rendered.indexOf("How often?")).toBeLessThan(rendered.lastIndexOf("Communication"));
    expect(rendered).toContain('role="group"');
    expect(rendered).toContain('name="answer-radio"');
    expect(participantSource).toContain('className="mt-3 grid gap-3"');
    expect(participantSource).toContain('compact contentClassName="p-0"');
  });

  it("shows one page at a time while retaining required-answer validation across every page", () => {
    const pages = [
      { id: "page-one", title: "Reflect", position: 0 },
      { id: "page-two", title: "Respond", position: 1 },
    ];
    const first = block({ id: "first", pageId: "page-one", title: "First prompt" });
    const second = block({ id: "second", pageId: "page-two", title: "Second prompt" });
    const assignment = { ...homework([first, second]), pages };
    const markup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: assignment }));
    expect(markup).toContain("Reflect");
    expect(markup).toContain("Page 1 of 2");
    expect(markup).toContain('aside aria-label="Your Homework pages"');
    expect(markup).toContain("lg:grid-cols-[21rem_minmax(0,1fr)]");
    expect(markup).toContain("PAGE 1");
    expect(markup).toContain("PAGE 2");
    expect(markup).toContain("border-text-muted/30 bg-surface-muted");
    expect(markup).not.toContain(">Add Page</button>");
    expect(markup).toContain("Previous Page");
    expect(markup).toContain("Next Page");
    expect(markup).toContain("Save Draft");
    expect(markup).toContain("Submit Homework");
    expect(markup).toContain("First prompt");
    expect(markup).toContain("Respond");
    expect(markup).not.toContain('for="answer-second"');
    expect(participantMissingRequirements(assignment, {})).toEqual(["First prompt", "Second prompt"]);
  });

  it("adds and removes independent Checkbox selections in published choice order", () => {
    const first = nextCheckboxAnswer([], "choice-two", true, choices);
    expect(first).toEqual(["choice-two"]);
    const multiple = nextCheckboxAnswer(first, "choice-one", true, choices);
    expect(multiple).toEqual(["choice-one", "choice-two"]);
    expect(nextCheckboxAnswer(multiple, "choice-two", false, choices)).toEqual(["choice-one"]);
  });

  it("replaces Radio selection and exposes an optional clear control", () => {
    expect(nextRadioAnswer("choice-one")).toBe("choice-one");
    expect(nextRadioAnswer("choice-three")).toBe("choice-three");
    const rendered = renderToStaticMarkup(createElement(ParticipantHomeworkContent, {
      homework: homework([block({ id: "radio", type: "radio_question", questionChoices: choices, isRequired: false, answer: "choice-two" })]),
    }));
    expect(rendered).toContain("Clear selection");
    expect(participantSource).toContain('onClick={() => onChange("")}');
  });

  it("restores typed saved answers and detects array changes without flattening them", () => {
    const assignment = homework([
      block({ id: "long", answer: "Saved response" }),
      block({ id: "checkbox", type: "checkbox_question", questionChoices: choices, answer: ["choice-one", "choice-three"] }),
      block({ id: "radio", type: "radio_question", questionChoices: choices, answer: "choice-two" }),
    ]);
    expect(participantAnswerValues(assignment)).toEqual({
      long: "Saved response",
      checkbox: ["choice-one", "choice-three"],
      radio: "choice-two",
    });
    expect(participantAnswersAreDirty(participantAnswerValues(assignment), participantAnswerValues(assignment))).toBe(false);
    expect(participantAnswersAreDirty({ ...participantAnswerValues(assignment), checkbox: ["choice-one"] }, participantAnswerValues(assignment))).toBe(true);
    const rendered = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: assignment }));
    expect(rendered).toContain('data-state="checked"');
    expect(rendered).toContain('data-state="unchecked"');
  });

  it("validates required Long Answer and selection questions while allowing optional blanks", () => {
    const assignment = homework([
      block({ id: "long" }),
      block({ id: "required-checkbox", type: "checkbox_question", questionChoices: choices, answer: [] }),
      block({ id: "required-radio", type: "radio_question", questionChoices: choices }),
      block({ id: "optional-checkbox", type: "checkbox_question", questionChoices: choices, isRequired: false, answer: [] }),
      block({ id: "optional-radio", type: "radio_question", questionChoices: choices, isRequired: false }),
    ]);
    expect(participantRequiredAnswerErrors(assignment, participantAnswerValues(assignment))).toEqual({
      long: "A response is required.",
      "required-checkbox": "A response is required.",
      "required-radio": "A response is required.",
    });
    expect(participantRequiredAnswerErrors(assignment, {
      ...participantAnswerValues(assignment),
      long: "Ready",
      "required-checkbox": ["choice-one"],
      "required-radio": "choice-two",
    })).toEqual({});
  });

  it("stores each side independently, requires both nonblank only when configured, and renders responsive columns", () => {
    const sideBySide = block({
      id: "group", type: "side_by_side_response", content: null,
      description: "Optional instructions", isRequired: true,
      sideBySideConfig: { groupId: "ab29786c-cc70-4b39-9f75-8640aa0872f7", instructions: "Optional instructions", leftHeading: "Recognize", rightHeading: "Renew", bothRequired: true, responseMode: "paired_rows_v1" },
      sideBySideResponseIds: { left: "stable-left-id", right: "stable-right-id" },
      answer: { left: "Left saved", right: "" },
    });
    const assignment = homework([sideBySide]);
    expect(participantAnswerValues(assignment)).toEqual({
      "stable-left-id": JSON.stringify({ version: 1, rows: [{ id: "ab29786c-cc70-4b39-9f75-8640aa0872f7", value: "Left saved" }] }),
      "stable-right-id": JSON.stringify({ version: 1, rows: [{ id: "ab29786c-cc70-4b39-9f75-8640aa0872f7", value: "" }] }),
    });
    expect(participantRequiredAnswerErrors(assignment, participantAnswerValues(assignment))).toEqual({
      "stable-left-id": "Complete both responses in each started pair. At least one complete pair is required.",
      "stable-right-id": "Complete both responses in each started pair. At least one complete pair is required.",
    });
    expect(participantRequiredAnswerErrors(assignment, {
      "stable-left-id": JSON.stringify({ version: 1, rows: [{ id: "ab29786c-cc70-4b39-9f75-8640aa0872f7", value: "Left saved" }] }),
      "stable-right-id": JSON.stringify({ version: 1, rows: [{ id: "ab29786c-cc70-4b39-9f75-8640aa0872f7", value: "Right saved" }] }),
    })).toEqual({});
    expect(participantRequiredAnswerErrors(homework([{ ...sideBySide, sideBySideConfig: { ...sideBySide.sideBySideConfig!, bothRequired: false } }]), { "stable-left-id": "", "stable-right-id": "" })).toEqual({});
    const markup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: assignment }));
    expect(markup).toContain("Recognize");
    expect(markup).toContain("Renew");
    expect(markup).toContain('id="response-ab29786c-cc70-4b39-9f75-8640aa0872f7:left"');
    expect(markup).toContain('id="response-ab29786c-cc70-4b39-9f75-8640aa0872f7:right"');
    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain("sm:gap-4");
    expect(markup).toContain("text-base");
    expect(markup).toContain("Left saved");
    expect(markup).toContain("Add response");
    expect(markup).toContain("At least one complete pair is required");
    expect(markup).toMatch(/>Submit Homework<\/button>/);
    expect(markup).toMatch(/disabled=""[^>]*>Submit Homework<\/button>/);
    const optionalMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: homework([{ ...sideBySide, sideBySideConfig: { ...sideBySide.sideBySideConfig!, bothRequired: false } }]) }));
    expect(optionalMarkup).not.toMatch(/disabled=""[^>]*>Submit Homework<\/button>/);
    expect(optionalMarkup).toContain("Save Draft");
  });

  it("requires one complete pair, rejects every partially populated pair, and permits incomplete optional responses", () => {
    const required = block({ id: "paired", type: "side_by_side_response", answer: { left: "", right: "" },
      sideBySideConfig: { groupId: "ab29786c-cc70-4b39-9f75-8640aa0872f7", instructions: "", leftHeading: "Left", rightHeading: "Right", bothRequired: true },
      sideBySideResponseIds: { left: "left-block", right: "right-block" } });
    const assignment = homework([required]);
    const rows = [
      { id: "a555f2d8-84ce-44ca-9de8-2d6babaf994e", left: "Complete", right: "Pair" },
      { id: "b5edf42b-9646-41a9-9fc0-996e2a6833c4", left: "Started", right: "" },
    ];
    expect(participantRequiredAnswerErrors(assignment, {
      "left-block": JSON.stringify({ version: 1, rows: rows.map(({ id, left: value }) => ({ id, value })) }),
      "right-block": JSON.stringify({ version: 1, rows: rows.map(({ id, right: value }) => ({ id, value })) }),
    })).toMatchObject({ "left-block": expect.any(String), "right-block": expect.any(String) });
    const optional = homework([{ ...required, sideBySideConfig: { ...required.sideBySideConfig!, bothRequired: false } }]);
    expect(participantRequiredAnswerErrors(optional, participantAnswerValues(optional))).toEqual({});
  });

  it("enables Submit for valid persisted pairs and identifies other incomplete requirements", () => {
    const pair = block({
      id: "pair", type: "side_by_side_response", content: null,
      sideBySideConfig: { groupId: "ab29786c-cc70-4b39-9f75-8640aa0872f7", instructions: "", leftHeading: "Recognize", rightHeading: "Renounce", bothRequired: true },
      sideBySideResponseIds: { left: "stable-left", right: "stable-right" },
      sideBySideRows: [
        { id: "a555f2d8-84ce-44ca-9de8-2d6babaf994e", left: "A saved response", right: "Its paired answer" },
        { id: "b5edf42b-9646-41a9-9fc0-996e2a6833c4", left: "Another response", right: "Another answer" },
      ],
    });
    const answers = participantAnswerValues(homework([pair]));
    const missingRequiredQuestion = block({ id: "other-required", content: content("What will you practice?") });
    const assignmentWithOtherRequirement = homework([pair, missingRequiredQuestion]);
    const combinedAnswers = participantAnswerValues(assignmentWithOtherRequirement);

    expect(answers).toEqual({
      "stable-left": JSON.stringify({ version: 1, rows: pair.sideBySideRows!.map(({ id, left: value }) => ({ id, value })) }),
      "stable-right": JSON.stringify({ version: 1, rows: pair.sideBySideRows!.map(({ id, right: value }) => ({ id, value })) }),
    });
    expect(participantRequiredAnswerErrors(homework([pair]), answers)).toEqual({});
    expect(participantAnswersAreDirty(answers, answers)).toBe(false);
    expect(participantMissingRequirements(homework([pair]), answers)).toEqual([]);

    const validMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: homework([pair]) }));
    expect(validMarkup).not.toMatch(/disabled=""[^>]*>Submit Homework<\/button>/);
    expect(validMarkup).not.toContain("Complete these required responses to submit");

    expect(participantMissingRequirements(assignmentWithOtherRequirement, combinedAnswers)).toEqual(["What will you practice?"]);
    const incompleteMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: assignmentWithOtherRequirement }));
    expect(incompleteMarkup).toMatch(/disabled=""[^>]*>Submit Homework<\/button>/);
    expect(incompleteMarkup).toContain("Complete these required responses to submit: What will you practice?");
  });

  it("uses one assignment form and submits the latest shared typed answer state", () => {
    const rendered = renderToStaticMarkup(createElement(ParticipantHomeworkContent, {
      homework: homework([
        block({ id: "long", answer: "Saved" }),
        block({ id: "checkbox", type: "checkbox_question", questionChoices: choices, answer: [] }),
      ]),
    }));
    expect(rendered.match(/<form/g)).toHaveLength(1);
    expect(rendered.match(/Save Draft/g)).toHaveLength(1);
    expect(rendered.match(/Submit Homework/g)).toHaveLength(1);
    expect(participantSource).toContain("persistParticipantHomework({ progressId: homework.progressId, answers, intent })");
    expect(participantSource).toContain("setSavedAnswers(cloneAnswers(answers))");
    expect(participantSource).toContain('showSuccessToast(intent === "save" ? "Homework draft saved." : "Homework submitted successfully.")');
    expect(participantSource).toContain("showErrorToast(result.error");
    expect(participantSource).not.toContain('text: intent === "save" ? "Draft saved"');
  });

  it("warns only while assignment answers are dirty", () => {
    expect(participantSource).toContain("if (!dirty) return;");
    expect(participantSource).toContain('window.addEventListener("beforeunload"');
    expect(participantSource).toContain("eligibleInternalNavigation");
  });

  it("keeps submitted selection answers visible and read-only", () => {
    const rendered = renderToStaticMarkup(createElement(ParticipantHomeworkContent, {
      homework: homework([
        block({ id: "checkbox", type: "checkbox_question", questionChoices: choices, answer: ["choice-one"] }),
        block({ id: "radio", type: "radio_question", questionChoices: choices, answer: "choice-two" }),
      ], "submitted"),
    }));
    expect(rendered).toContain("Submitted Homework is read-only.");
    expect(rendered).toContain("disabled");
    expect(rendered).toContain('data-state="checked"');
    expect(rendered).not.toContain("Save Draft");
    expect(rendered).not.toContain("Submit Homework");
  });

  it("renders no assignment actions for missing Homework", () => {
    const rendered = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: null, emptyTitle: "No Homework for this Session" }));
    expect(rendered).toContain("No Homework for this Session");
    expect(rendered).not.toContain("Save Draft");
    expect(rendered).not.toContain("Submit Homework");
  });

  it("keeps both participant entry points on the same renderer", () => {
    const sessionView = readFileSync("features/couple-workspace/session-view.tsx", "utf8");
    const homeworkPage = readFileSync("app/workspace/homework/page.tsx", "utf8");
    expect(sessionView).toContain("<ParticipantHomeworkContent");
    expect(sessionView).toContain("showHeader={false}");
    expect(participantSource).toContain("<ParticipantHomeworkContent homework={homework}");
    expect(homeworkPage).toContain("HomeworkParticipantPage homework={homework}");
  });

  it("can omit its duplicate heading on Session View while keeping it on the legacy Homework page", () => {
    const assignment = homework([]);
    const sessionMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: assignment, readOnly: true, showHeader: false }));
    expect(sessionMarkup).not.toContain("Session Homework");
    expect(sessionMarkup).not.toContain("Testing Homework");
    const legacyMarkup = renderToStaticMarkup(createElement(ParticipantHomeworkContent, { homework: assignment, readOnly: true }));
    expect(legacyMarkup).toContain("Session Homework");
    expect(legacyMarkup).toContain("Testing Homework");
    expect(legacyMarkup).toContain("Status:");
  });
});
