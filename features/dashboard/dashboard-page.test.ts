import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/attention-panel", () => ({ AttentionPanel: () => createElement("section", { "data-dashboard-section": "Needs Attention" }) }));
vi.mock("@/components/dashboard/assignment-queue-panel", () => ({ AssignmentQueuePanel: () => createElement("section", { "data-dashboard-section": "Assignment Queue" }) }));
vi.mock("@/components/dashboard/team-availability-carousel", () => ({ TeamAvailabilityCarousel: () => createElement("section", { "data-dashboard-section": "Team Availability" }) }));
vi.mock("@/components/dashboard/dashboard-header", () => ({ DashboardHeader: () => null }));
vi.mock("@/components/dashboard/metric-card", () => ({ MetricCard: ({ metric }: { metric: { label: string } }) => createElement("section", { "data-dashboard-metric": metric.label }) }));
vi.mock("@/components/dashboard/workflow-panel", () => ({ WorkflowPanel: () => createElement("section", { "data-dashboard-section": "Ministry Progression Counseling Sessions" }) }));
vi.mock("@/features/dashboard/queries", () => ({
  getDashboardAttentionItems: async () => ({ items: [], error: null }),
  getAdminDashboardCounts: async () => ({ counts: null, error: "unavailable" }),
  getCampusLeadDashboardCounts: async () => ({ counts: null, error: "unavailable" }),
  getDashboardCounselingProgression: async () => ({ progression: null, error: "unavailable" }),
}));
vi.mock("@/features/dashboard/team-availability-queries", () => ({ getDashboardTeamAvailability: async () => ({ teams: [], error: null }) }));

import { DashboardPage } from "./dashboard-page";
import type { AuthenticatedIdentity } from "@/lib/auth/session";

describe("shared Dashboard sections", () => {
  it("keeps the existing sections and removes Upcoming Activity without leaving its two-column slot", async () => {
    const identity = { id: "admin-profile", displayName: "Admin", roles: ["admin"], workspaces: ["admin"] } as AuthenticatedIdentity;
    const markup = renderToStaticMarkup(await DashboardPage({ identity }));

    expect(markup).toContain('data-dashboard-metric="Unassigned Couples"');
    expect(markup).toContain('data-dashboard-section="Needs Attention"');
    expect(markup).toContain('data-dashboard-section="Team Availability"');
    expect(markup).toContain('data-dashboard-section="Ministry Progression Counseling Sessions"');
    expect(markup).toContain('data-dashboard-section="Assignment Queue"');
    expect(markup).not.toContain("Upcoming Activity");
    expect(markup).not.toContain("Next operational checkpoints");
    expect(markup).toContain('<div class="mt-7"><section data-dashboard-section="Assignment Queue"></section></div>');
  });
});
