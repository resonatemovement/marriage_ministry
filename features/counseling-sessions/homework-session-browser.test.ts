import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./homework-reopen-button", () => ({ ReopenHomeworkButton: ({ partnerName, viewAnswersHref, canReopen }: { partnerName: string; viewAnswersHref?: string; canReopen: boolean }) => createElement("div", null, viewAnswersHref ? createElement("a", { href: viewAnswersHref }, "View Answers") : null, canReopen ? `Reopen Homework for ${partnerName}` : null) }));

import { HomeworkSessionBrowser, initialHomeworkSessionSelection } from "./homework-session-browser";
import type { CounselingSessionCard } from "./queries";

const card = {
  caseId: "case-1",
  coupleName: "James Smith & Gina Lee",
  status: "active",
  partners: [{ id: "james", name: "James Smith", photoUrl: null }, { id: "gina", name: "Gina Lee", photoUrl: null }],
  state: { caseSession: { id: "current-case-session", status: "active" } },
  homeworkSessions: [
    { caseSessionId: "previous-case-session", title: "Communication", actualSequence: 1, templateSequence: 1, status: "completed", revisionAssigned: true, partners: [{ progressId: "previous-james", profileId: "james", name: "James Smith", status: "submitted" }, { progressId: "previous-gina", profileId: "gina", name: "Gina Lee", status: "reviewed" }] },
    { caseSessionId: "current-case-session", title: "Trust", actualSequence: 2, templateSequence: 2, status: "active", revisionAssigned: true, partners: [{ progressId: "current-james", profileId: "james", name: "James Smith", status: "submitted" }, { progressId: "current-gina", profileId: "gina", status: "in_progress" }] },
  ],
} as unknown as CounselingSessionCard;

describe("HomeworkSessionBrowser", () => {
  it("initially selects and highlights the actual current Session without changing it", () => {
    expect(initialHomeworkSessionSelection(card.homeworkSessions, "current-case-session")).toBe("current-case-session");
    const markup = renderToStaticMarkup(createElement(HomeworkSessionBrowser, { card, canReopenHomework: true }));
    expect(markup).toContain('aria-label="Select a Session to review Homework"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Session 2: Trust");
    expect(markup.indexOf("Session 2</span>")).toBeLessThan(markup.indexOf("Session 1</span>"));
    expect(markup).toContain(">Current</span>");
    expect(markup).toContain("Reopen Homework for James Smith");
    expect(markup).not.toContain("Reopen Homework for Gina Lee");
  });

  it("provides historical submitted answers but never offers historical reopening", () => {
    const previousSession = card.homeworkSessions[0];
    expect(initialHomeworkSessionSelection([previousSession], "current-case-session")).toBe("previous-case-session");
    const historyCard = { ...card, homeworkSessions: [previousSession] } as CounselingSessionCard;
    const markup = renderToStaticMarkup(createElement(HomeworkSessionBrowser, { card: historyCard, canReopenHomework: true }));
    expect(markup).toContain('href="/workspace/cases/case-1/homework/previous-james"');
    expect(markup).toContain('href="/workspace/cases/case-1/homework/previous-gina"');
    expect(markup).not.toContain("Reopen Homework");
    expect(markup).toContain("James Smith");
    expect(markup).toContain("Gina Lee");
  });
});
