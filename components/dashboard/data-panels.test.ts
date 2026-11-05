import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssignmentQueuePanel } from "./assignment-queue-panel";
import { AttentionPanel } from "./attention-panel";
import { CapacityPanel } from "./capacity-panel";
import { MetricCard } from "./metric-card";
import { UpcomingPanel } from "./upcoming-panel";
import { WorkflowPanel } from "./workflow-panel";
import { dashboardMetrics, dashboardWorkflow } from "@/features/dashboard/data";

describe("Admin dashboard live-data presentation", () => {
  it("shows explicit unavailable states instead of fictional queue, capacity, or activity data", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(AttentionPanel), createElement(CapacityPanel), createElement(AssignmentQueuePanel), createElement(UpcomingPanel),
    ));
    expect(markup.match(/Not yet available\./g)).toHaveLength(3);
    expect(markup).toContain("Assignment queue details are not yet available.");
    expect(markup).not.toContain("Maya &amp; Jordan");
    expect(markup).not.toContain("AUG 19");
    expect(markup).not.toContain("63%");
  });

  it("renders unavailable metrics as unavailable rather than zero", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      ...dashboardMetrics(null).map((metric) => createElement(MetricCard, { key: metric.label, metric })),
    ));
    expect(markup.match(/Live data unavailable/g)).toHaveLength(8);
    expect(markup).not.toContain("+3 this month");
  });

  it("renders live workflow statuses without hardcoded values and includes every current Case status", () => {
    const stages = dashboardWorkflow(null);
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { stages, total: null }));
    expect(stages).toHaveLength(9);
    expect(stages.every(({ count }) => count === null)).toBe(true);
    expect(markup).toContain("Requested");
    expect(markup).toContain("Closed — Incomplete");
    expect(markup).not.toContain("82 total cases");
    expect(markup).toContain("Live data unavailable");
  });
});
