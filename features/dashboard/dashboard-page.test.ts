import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/dashboard/attention-panel", () => ({ AttentionPanel: () => createElement("section", { "data-dashboard-section": "Needs Attention" }) }));
vi.mock("@/components/dashboard/team-availability-carousel", () => ({ TeamAvailabilityCarousel: () => createElement("section", { "data-dashboard-section": "Team Availability" }) }));
vi.mock("@/components/dashboard/dashboard-header", () => ({ DashboardHeader: () => null }));
vi.mock("@/components/dashboard/metric-card", () => ({ MetricCard: ({ metric }: { metric: { label: string; href: string | null } }) => createElement("section", { "data-dashboard-metric": metric.label, "data-href": metric.href }) }));
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
  it("keeps all approved Dashboard sections, unassigned navigation, and no Assignment Queue slot", async () => {
    const identity = { id: "admin-profile", displayName: "Admin", roles: ["admin"], workspaces: ["admin"] } as AuthenticatedIdentity;
    const markup = renderToStaticMarkup(await DashboardPage({ identity }));

    expect(markup).toContain('data-dashboard-metric="Unassigned Couples"');
    expect(markup).toContain('data-href="/people?filter=couples&amp;caseStatus=unassigned"');
    expect(markup).toContain('data-dashboard-section="Needs Attention"');
    expect(markup).toContain('data-dashboard-section="Team Availability"');
    expect(markup).toContain('data-dashboard-section="Ministry Progression Counseling Sessions"');
    expect(markup).toContain('data-dashboard-metric="Active Couples"');
    expect(markup).toContain('data-dashboard-metric="Under Review Intakes"');
    expect(markup).toContain('data-dashboard-metric="Completed Couples"');
    expect(markup).not.toContain("Upcoming Activity");
    expect(markup).not.toContain("Next operational checkpoints");
    expect(markup).not.toContain("Assignment Queue");
    expect(markup).not.toContain("Assignment queue");
  });
});
