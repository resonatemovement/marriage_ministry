import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./homework-participant-actions", () => ({ persistParticipantHomework: vi.fn() }));

import {
  ParticipantHomeworkContent,
  nextCheckboxAnswer,
  nextRadioAnswer,
  participantAnswersAreDirty,
  participantAnswerValues,
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
  blocks,
});

describe("participant Homework presentation", () => {
  it("uses compact Rich Text and naturally sized outer blocks", () => {
    expect(participantSource).toContain('<Card key={block.id} className="p-5 sm:p-7">');
    expect(participantSource).not.toContain('className="min-h-40');
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
