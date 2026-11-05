import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DashboardMetric } from "@/features/dashboard/data";
import { MetricCard } from "./metric-card";

describe("Admin dashboard metric navigation", () => {
  it("makes the complete metric card one accessible link", () => {
    const metric: DashboardMetric = { label: "Active couples", value: 5, detail: "Current Case status: Active", href: "/people?filter=couples&caseStatus=active", tone: "blue" };
    const markup = renderToStaticMarkup(createElement(MetricCard, { metric }));

    expect(markup).toContain('aria-label="View Active couples" class="group block rounded-lg focus-visible:bg-sidebar-accent focus-visible:outline-none" href="/people?filter=couples&amp;caseStatus=active"');
    expect(markup).toContain("Current Case status: Active");
    expect((markup.match(/<a\b/g) ?? [])).toHaveLength(1);
  });
});
