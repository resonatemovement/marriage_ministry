import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardProgression } from "@/features/dashboard/data";
import { WorkflowPanel } from "./workflow-panel";

const progression: DashboardProgression = {
  stages: [
    { id: "intake", label: "Intake", valueLabel: "Intake Requests", count: 2, href: "/intake-requests?view=open" },
    { id: "onboarding", label: "Onboarding", valueLabel: "Couples", count: 1, href: "/people?filter=couples&workflowStage=onboarding" },
    { id: "awaiting_assignment", label: "Awaiting Assignment", valueLabel: "Couples", count: 3, href: "/people?filter=couples&workflowStage=awaiting_assignment" },
    { id: "counseling", label: "Counseling", valueLabel: "Couples", count: 4, href: "/people?filter=couples&workflowStage=counseling" },
    { id: "completed", label: "Completed", valueLabel: "Couples", count: 5, href: "/people?filter=couples&workflowStage=completed" },
    { id: "referred", label: "Referred", valueLabel: "Couples", count: 6, href: "/people?filter=couples&workflowStage=referred" },
    { id: "closed_incomplete", label: "Closed — Incomplete", valueLabel: "Couples", count: 7, href: "/people?filter=couples&workflowStage=closed_incomplete" },
  ],
  sessions: [
    { id: "initial", number: null, title: "Initial Meeting", count: 3, href: "/people?filter=couples&workflowSession=initial" },
    { id: "session-1", number: 1, title: "Session One", count: 2, href: "/people?filter=couples&workflowSession=session-1" },
  ],
  unclassifiedCount: 0,
};

describe("Dashboard ministry progression panel", () => {
  it("renders primary stages before grouped outcomes and preserves exact Admin drill-down filters", () => {
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression }));
    expect(markup).toContain("Ministry Progression");
    expect(markup).toContain("Counseling Sessions");
    const primaryStageOrder = ["Intake", "Onboarding", "Awaiting Assignment", "Counseling", "Completed"];
    const primaryStagePositions = primaryStageOrder.map((label) => markup.indexOf(`>${label}</p>`));
    expect(primaryStagePositions.every((position) => position >= 0)).toBe(true);
    expect(primaryStagePositions).toEqual([...primaryStagePositions].sort((a, b) => a - b));
    const outcomesPosition = markup.indexOf("Other Outcomes");
    expect(outcomesPosition).toBeGreaterThan(primaryStagePositions.at(-1)!);
    expect(markup.indexOf(">Referred</p>")).toBeGreaterThan(outcomesPosition);
    expect(markup.indexOf(">Closed — Incomplete</p>")).toBeGreaterThan(outcomesPosition);
    expect(markup).toContain("href=\"/intake-requests?view=open\"");
    expect(markup).toContain("workflowStage=counseling");
    expect(markup).toContain("workflowStage=closed_incomplete");
    expect(markup).toContain("workflowSession=initial");
    expect(markup).toContain("Initial Meeting");
    expect(markup).not.toContain("Session 0");
  });

  it("keeps Campus Lead Couple and Session counts aggregate-only while retaining scoped Intake navigation", () => {
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression, canNavigate: false }));
    expect(markup).toContain("href=\"/intake-requests?view=open\"");
    expect(markup).not.toContain("href=\"/people?");
  });

  it("reports unclassified records without silently including them in a stage", () => {
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression: { ...progression, unclassifiedCount: 2 } }));
    expect(markup).toContain("2 records need review and are not included in stage totals.");
  });

  it("shows safe unavailable state when the aggregate RPC is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression: null }));
    expect(markup).toContain("Live data unavailable");
    expect(markup).toContain("Progression data is temporarily unavailable.");
  });

  it.each([3, 7, 8])("renders all %i published Session tiles dynamically", (publishedSessionCount) => {
    const sessions = [progression.sessions[0], ...Array.from({ length: publishedSessionCount }, (_, index) => ({
      id: `published-session-${index + 1}`,
      number: index + 1,
      title: `Published Session ${index + 1}`,
      count: index % 2,
      href: `/people?filter=couples&workflowSession=published-session-${index + 1}`,
    }))];
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression: { ...progression, sessions } }));
    expect(markup.match(/class="[^"]*"[^>]*>Session \d+<\/p>/g)).toHaveLength(publishedSessionCount);
    expect(markup).toContain(">Initial Meeting</p>");
    for (let number = 1; number <= publishedSessionCount; number += 1) {
      expect(markup).toContain(`>Session ${number}</p>`);
      expect(markup).not.toContain(`Published Session ${number}`);
    }
    expect(markup).not.toContain("Before the first published Session");
  });

  it("keeps Session counts while omitting stage descriptions", () => {
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression }));
    expect(markup).toContain(">3</p>");
    expect(markup).toContain(">2</p>");
    expect(markup).not.toContain("Session One");
    expect(markup).not.toContain("Before the first published Session");
    expect(markup).toContain("Intake Requests");
    expect(markup).toContain("Couples");
  });
});
