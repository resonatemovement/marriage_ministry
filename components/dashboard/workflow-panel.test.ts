import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { calculateDashboardCounts, dashboardWorkflow } from "@/features/dashboard/data";
import { WorkflowPanel } from "./workflow-panel";

describe("Admin dashboard workflow navigation", () => {
  it("links all eight visible stages to their actual status-filtered Couple list", () => {
    const stages = dashboardWorkflow(calculateDashboardCounts([], []));
    const markup = renderToStaticMarkup(createElement(WorkflowPanel, { stages, total: 0 }));

    expect((markup.match(/href="\/people\?filter=couples&amp;caseStatus=/g) ?? [])).toHaveLength(8);
    expect(markup).not.toContain("Pending final");
    for (const stage of stages) {
      expect(markup).toContain(`caseStatus=${stage.status}`);
      expect(markup).toContain(`View Couples in ${stage.label} status`);
    }
  });
});
