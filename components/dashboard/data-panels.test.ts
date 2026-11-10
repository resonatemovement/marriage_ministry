import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AttentionPanel } from "./attention-panel";
import { TeamAvailabilityCarousel } from "./team-availability-carousel";
import { MetricCard } from "./metric-card";
import { WorkflowPanel } from "./workflow-panel";
import { dashboardMetrics } from "@/features/dashboard/data";

describe("Admin dashboard live-data presentation", () => {
  it("keeps clear empty states for live Dashboard panels", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(AttentionPanel, { items: [] }), createElement(TeamAvailabilityCarousel, { teams: [], error: false }),
    ));
    expect(markup).toContain("Team Availability");
    expect(markup).not.toContain("Team Capacity");
    expect(markup).toContain("Nothing needs attention right now.");
    expect(markup).not.toContain("Maya &amp; Jordan");
    expect(markup).not.toContain("AUG 19");
    expect(markup).not.toContain("63%");
    expect(markup).toContain("Nothing needs attention right now.");
  });

  it("renders unavailable metrics as unavailable rather than zero", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      ...dashboardMetrics(null).map((metric) => createElement(MetricCard, { key: metric.label, metric })),
    ));
    expect(markup.match(/Live data unavailable/g)).toHaveLength(8);
    expect(markup).not.toContain("+3 this month");
  });

  it("renders progression unavailable state without hardcoded values or legacy Case statuses", () => {
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { progression: null }));
    expect(markup).toContain("Ministry Progression");
    expect(markup).toContain("Closed — Incomplete");
    expect(markup).not.toContain("Requested");
    expect(markup).not.toContain("Pending final");
    expect(markup).not.toContain("82 total cases");
    expect(markup).toContain("Live data unavailable");
  });
});
