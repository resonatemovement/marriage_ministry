import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({ default: (props: Record<string, unknown>) => { const { unoptimized, ...imageProps } = props; void unoptimized; return createElement("img", imageProps); } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("a", props, children) }));

import { sessionCardState } from "./model";
import type { CounselingSessionCard } from "./queries";
import { SessionsWorkspace } from "./sessions-workspace";

const card: CounselingSessionCard = {
  caseId: "case-1", coupleId: "couple-1", coupleName: "John Smith & Stacy Miller", status: "matched",
  partners: [
    { id: "john", name: "John Smith", photoUrl: "https://example.test/john.jpg" },
    { id: "stacy", name: "Stacy Miller", photoUrl: "https://example.test/stacy.jpg" },
  ],
  state: sessionCardState("matched", [{ id: "session-1", number: 1, title: "Connection", isFinal: false }], [], []),
  publishedSessions: [{ id: "session-1", number: 1, title: "Connection", isFinal: false }],
  team: { campusLead: null, coach: { id: "coach-team", name: "Coach Team" }, counselor: null },
  homework: null,
};

describe("SessionsWorkspace", () => {
  it("shows assigned Couple names and available photos without invitation fallback copy", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card] }));
    expect(markup).toContain("John Smith &amp; Stacy Miller");
    expect(markup).toContain('src="https://example.test/john.jpg"');
    expect(markup).toContain('src="https://example.test/stacy.jpg"');
    expect(markup).not.toContain("Pending Couple invitation");
    expect(markup).toContain('href="/workspace/cases/case-1"');
    expect(markup).not.toContain("Schedule Initial Meeting");
    expect(markup).not.toContain("<button");
  });

  it("shows an accurate empty state for a Coach with no assigned cases", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [], isCoachWorkspace: true }));
    expect(markup).toContain("Pending couple assignment");
    expect(markup).toContain("No couple has been assigned to you yet.");
    expect(markup).not.toContain("Schedule Initial Meeting");
    expect(markup).not.toContain("Progress");
    expect(markup).not.toContain("Pending Couple invitation");
    expect(markup).not.toContain('href="/workspace/cases/');
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("Initial Meeting");
  });

  it("retains the existing non-Coach empty state", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [] }));
    expect(markup).toContain("No assigned counseling cases.");
    expect(markup).not.toContain("Pending couple assignment");
  });
});
