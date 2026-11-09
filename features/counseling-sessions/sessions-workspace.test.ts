import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
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
  materialSessions: [],
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

  it("shows the saved team availability in the Workspace header only when authorized team data is available", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, {
      cards: [],
      availability: { teamId: "team-1", acceptingNewCouples: true },
    }));
    expect(markup).toContain("Accepting New Couples");
    expect(markup).toContain('data-state="checked"');
    expect(markup).toContain("flex-col gap-4 sm:flex-row sm:items-start sm:justify-between");
    expect(markup).toContain("sm:pt-2");
    expect(markup).not.toContain("accepting-new-couples-description");
  });

  it("reflects a saved OFF value on initial render", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, {
      cards: [],
      availability: { teamId: "team-1", acceptingNewCouples: false },
    }));
    expect(markup).toContain('data-state="unchecked"');
  });

  it("does not render team availability when the user has no active authorized team", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [], availability: null }));
    expect(markup).not.toContain("Accepting New Couples");
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

  it("keeps Coach/Campus Lead Couple cards at natural height alongside the hierarchy rail", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card], workspaceRail: createElement("aside", null, "Hierarchy") }));
    expect(markup).toContain("h-auto");
    expect(markup).toContain("self-start");
    expect(markup).toContain("xl:grid-cols-2");
    expect(markup).toContain('aria-label="Counseling workspace"');
    expect(markup).toContain("Hierarchy");
  });

  it("keeps the empty state and hierarchy in the same two-column oversight grid", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [], workspaceRail: createElement("aside", null, "Hierarchy"), isCoachWorkspace: true }));
    expect(markup).toContain("Pending couple assignment");
    expect(markup).toContain("xl:grid-cols-2");
    expect(markup).toContain("Hierarchy");
    expect(markup).not.toContain("sm:col-span-2");
  });

  it("uses three equal wide-desktop columns for two Couples and the hierarchy", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card, { ...card, caseId: "case-2", coupleName: "Alex & Jordan" }], workspaceRail: createElement("aside", null, "Hierarchy") }));
    expect(markup).toContain("xl:grid-cols-3");
    expect(markup).toContain("John Smith &amp; Stacy Miller");
    expect(markup).toContain("Alex &amp; Jordan");
    expect(markup).toContain("xl:col-start-3 xl:row-start-1");
  });

  it("pins the hierarchy in the first wide-desktop row when more than two Couples wrap", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card, { ...card, caseId: "case-2" }, { ...card, caseId: "case-3" }], workspaceRail: createElement("aside", null, "Hierarchy") }));
    expect(markup).toContain("xl:grid-cols-3");
    expect(markup).toContain("md:col-start-2 md:row-start-1 xl:col-start-3 xl:row-start-1");
    expect((markup.match(/aria-label="Open counseling case for/g) ?? [])).toHaveLength(3);
    expect(markup).toContain("h-auto");
  });

  it("retains the existing non-Coach empty state", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [] }));
    expect(markup).toContain("No assigned counseling cases.");
    expect(markup).not.toContain("Pending couple assignment");
  });
});
