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
  homeworkSessions: [],
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

  it("keeps Coach/Campus Lead Couple cards equal-height in a separate grid from the hierarchy rail", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card], workspaceRail: createElement("aside", null, "Hierarchy") }));
    expect(markup).toContain("auto-rows-fr");
    expect(markup).toContain("items-stretch");
    expect(markup).toContain("relative flex h-full flex-col");
    expect(markup).toContain("relative z-0 flex flex-1 flex-col");
    expect(markup).toContain("mt-auto grid gap-2 border-t");
    expect(markup).toContain("xl:grid-cols-2");
    expect(markup).toContain("md:grid-cols-[minmax(0,1fr)_17rem]");
    expect(markup).toContain('aria-label="Counseling workspace"');
    expect(markup).toContain("Hierarchy");
    expect(markup).not.toContain("h-auto");
  });

  it("keeps the empty state in the card grid and hierarchy in its own column", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [], workspaceRail: createElement("aside", null, "Hierarchy"), isCoachWorkspace: true }));
    expect(markup).toContain("Pending couple assignment");
    expect(markup).toContain("auto-rows-fr");
    expect(markup).toContain("Hierarchy");
    expect(markup).toContain("md:grid-cols-[minmax(0,1fr)_17rem]");
  });

  it("uses two Couple-card columns beside the hierarchy for two Couples", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card, { ...card, caseId: "case-2", coupleName: "Alex & Jordan" }], workspaceRail: createElement("aside", null, "Hierarchy") }));
    expect(markup).toContain("xl:grid-cols-2");
    expect(markup).toContain("John Smith &amp; Stacy Miller");
    expect(markup).toContain("Alex &amp; Jordan");
    expect(markup).toContain("md:grid-cols-[minmax(0,1fr)_17rem]");
  });

  it("keeps three and additional Couple cards in equal-height rows without clipping long content", () => {
    const longCard = {
      ...card,
      caseId: "case-2",
      coupleName: "Alexandria and Jordan with a Longer Couple Display Name",
      state: sessionCardState("active", [{ id: "session-1", number: 1, title: "A Session Title That Wraps Without Being Truncated", isFinal: false }], [], [], [{ id: "case-session-1", sessionId: "session-1", actualSequence: 1, templateSequence: 1, title: "A Session Title That Wraps Without Being Truncated", status: "active", isFinal: false, homeworkAssignmentRevisionId: null, materialReleasedAt: "2026-11-01T00:00:00Z", homeworkReleasedAt: null }]),
    };
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card, { ...card, caseId: "case-2" }, { ...card, caseId: "case-3" }], workspaceRail: createElement("aside", null, "Hierarchy") }));
    const variedMarkup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [card, longCard, { ...card, caseId: "case-3" }], workspaceRail: createElement("aside", null, "Hierarchy") }));
    expect(markup).toContain("xl:grid-cols-2");
    expect((markup.match(/aria-label="Open counseling case for/g) ?? [])).toHaveLength(3);
    expect(variedMarkup).toContain("Alexandria and Jordan with a Longer Couple Display Name");
    expect(variedMarkup).toContain("A Session Title That Wraps Without Being Truncated");
    expect(variedMarkup).toContain("min-h-14");
    expect(variedMarkup).toContain("min-h-10");
    expect(variedMarkup).toContain("mt-auto grid gap-2 border-t");
    expect(variedMarkup).not.toContain("truncate");
    expect(variedMarkup).not.toContain("h-auto");
  });

  it("retains the existing non-Coach empty state", () => {
    const markup = renderToStaticMarkup(createElement(SessionsWorkspace, { cards: [] }));
    expect(markup).toContain("No assigned counseling cases.");
    expect(markup).not.toContain("Pending couple assignment");
  });
});
