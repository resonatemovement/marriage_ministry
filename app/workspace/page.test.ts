import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ workspace: "campus_lead" as "admin" | "campus_lead" | "coach" | "counselor" | "couple", roles: ["campus_lead"] as string[] }));
const getCoupleWorkspaceData = vi.hoisted(() => vi.fn(async () => ({ coupleName: "Alex & Jordan" })));
const getAdminDashboardCounts = vi.hoisted(() => vi.fn(async () => ({ counts: { unassignedCouples: 2, activeCouples: 5, pendingFinalCouples: 0, completedCouples: 1, currentCases: 9, workflow: [] }, error: null })));

vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "profile", displayName: "Campus Lead", roles: state.roles, workspaces: state.roles.includes("super_admin") ? ["coach", "admin"] : [state.workspace] }, workspace: state.workspace })) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", { "data-shell": "workspace" }, children) }));
vi.mock("@/features/counseling-sessions/queries", () => ({ getCounselingSessionCards: vi.fn(async () => []) }));
vi.mock("@/features/counseling-sessions/workspace-queries", () => ({ getCurrentCampusLeadCoaches: vi.fn(async () => [{ id: "coach", name: "Fremont Coaches", campus: "Fremont" }]), getCurrentCoachCounselors: vi.fn(async () => [{ id: "counselor", name: "John & Stacy Wu", campus: "Oakland" }]) }));
vi.mock("@/features/counseling-sessions/oversight-rail-queries", () => ({ getCampusLeadCoachNodes: vi.fn(async () => [{ id: "coach" }]), getCoachCounselorNodes: vi.fn(async () => [{ id: "counselor" }]) }));
vi.mock("@/features/counseling-sessions/sessions-workspace", () => ({ SessionsWorkspace: ({ className, workspaceRail, isCoachWorkspace = false }: { className?: string; workspaceRail?: ReactNode; isCoachWorkspace?: boolean }) => createElement("div", { "data-sessions": "primary", "data-coach-empty-state": isCoachWorkspace, className }, "Sessions", workspaceRail) }));
vi.mock("@/features/counseling-sessions/workspace-rail", () => ({ CampusLeadCoachesRail: ({ coaches }: { coaches: unknown[] }) => createElement("aside", { "data-coaches": coaches.length }, "Coaches"), CoachCounselorsRail: ({ counselors }: { counselors: unknown[] }) => createElement("aside", { "data-counselors": counselors.length }, "Counselors") }));
vi.mock("@/features/workspace/workspace-placeholder", () => ({ WorkspacePlaceholder: () => createElement("div", null, "Placeholder") }));
vi.mock("@/features/couple-workspace/queries", () => ({ getCoupleWorkspaceData }));
vi.mock("@/features/prepare-enrich/server", () => ({ getCouplePrepareEnrichDocument: vi.fn(async () => null) }));
vi.mock("@/features/dashboard/queries", () => ({ getAdminDashboardCounts }));
vi.mock("@/features/couple-workspace/workspace", () => ({ CoupleWorkspace: ({ data }: { data: { coupleName: string } | null }) => createElement("div", { "data-couple-workspace": "true" }, data?.coupleName) }));
vi.mock("@/components/dashboard/dashboard-header", () => ({ DashboardHeader: () => null }));
vi.mock("@/components/dashboard/attention-panel", () => ({ AttentionPanel: () => null }));
vi.mock("@/components/dashboard/assignment-queue-panel", () => ({ AssignmentQueuePanel: () => null }));
vi.mock("@/components/dashboard/capacity-panel", () => ({ CapacityPanel: () => null }));
vi.mock("@/components/dashboard/metric-card", () => ({ MetricCard: () => null }));
vi.mock("@/components/dashboard/upcoming-panel", () => ({ UpcomingPanel: () => null }));
vi.mock("@/components/dashboard/workflow-panel", () => ({ WorkflowPanel: () => null }));
vi.mock("@/features/dashboard/data", () => ({ dashboardMetrics: () => [], dashboardWorkflow: () => [] }));

import WorkspaceRoute from "./page";
import { counselingSessionsGridClassName, counselingSessionsOversightGridClassName } from "@/features/counseling-sessions/presentation";

describe("Counseling Workspace route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Sessions as the primary Campus Lead Workspace view and adds only that lead's Coaches rail", async () => {
    state.workspace = "campus_lead";
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-sessions="primary"');
    expect(markup).toContain('data-coaches="1"');
    expect(markup).not.toContain("Search couples");
    expect(counselingSessionsGridClassName).toContain("grid-cols-1");
    expect(counselingSessionsGridClassName).toContain("sm:grid-cols-2");
    expect(counselingSessionsGridClassName).not.toContain("grid-cols-3");
    expect(counselingSessionsOversightGridClassName(1)).toContain("xl:grid-cols-2");
  });

  it("keeps Sessions primary and adds only the supervised Counselor rail in Coach Workspace", async () => {
    state.workspace = "coach";
    state.roles = ["coach"];
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-sessions="primary"');
    expect(markup).toContain('data-coach-empty-state="true"');
    expect(markup).toContain('data-counselors="1"');
    expect(markup).not.toContain("data-coaches");
  });

  it("keeps the same Coach rail for Coach-only and Coach + Super Admin identities", async () => {
    state.workspace = "coach";
    state.roles = ["coach"];
    const coachOnlyMarkup = renderToStaticMarkup(await WorkspaceRoute());
    state.roles = ["coach", "super_admin"];
    const multiRoleMarkup = renderToStaticMarkup(await WorkspaceRoute());
    expect(coachOnlyMarkup).toContain('data-counselors="1"');
    expect(multiRoleMarkup).toContain('data-counselors="1"');
    expect(multiRoleMarkup).not.toContain("Admin overview");
  });

  it("keeps Counselors in the Counseling Workspace without loading Couple data", async () => {
    state.workspace = "counselor";
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-sessions="primary"');
    expect(markup).toContain('data-coach-empty-state="false"');
    expect(markup).not.toContain('data-couple-workspace="true"');
    expect(getCoupleWorkspaceData).not.toHaveBeenCalled();
  });

  it("keeps the Admin overview route separate from Coach and Campus Lead rails", async () => {
    state.workspace = "admin";
    state.roles = ["admin"];
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('id="overview"');
    expect(markup).not.toContain('data-sessions="primary"');
    expect(markup).not.toContain("Counselors");
    expect(markup).not.toContain("Coaches");
    expect(getAdminDashboardCounts).toHaveBeenCalledOnce();
  });

  it("loads the same live dashboard data for an Admin-workspace Super Admin", async () => {
    state.workspace = "admin";
    state.roles = ["super_admin"];
    await WorkspaceRoute();
    expect(getAdminDashboardCounts).toHaveBeenCalledOnce();
  });

  it("does not request Admin dashboard data for non-Admin workspaces", async () => {
    state.workspace = "coach";
    state.roles = ["coach"];
    await WorkspaceRoute();
    expect(getAdminDashboardCounts).not.toHaveBeenCalled();
  });

  it("renders the server-resolved Couple Workspace at the shared entry point", async () => {
    state.workspace = "couple";
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-couple-workspace="true"');
    expect(markup).toContain("Alex &amp; Jordan");
  });
});
