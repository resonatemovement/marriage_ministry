import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ workspace: "campus_lead" as "campus_lead" | "coach" | "counselor" | "couple" }));
const getCoupleWorkspaceData = vi.hoisted(() => vi.fn(async () => ({ coupleName: "Alex & Jordan" })));

vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "profile", displayName: "Campus Lead", roles: [state.workspace], workspaces: [state.workspace] }, workspace: state.workspace })) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", { "data-shell": "workspace" }, children) }));
vi.mock("@/features/counseling-sessions/queries", () => ({ getCounselingSessionCards: vi.fn(async () => []) }));
vi.mock("@/features/counseling-sessions/workspace-queries", () => ({ getCurrentCampusLeadCoaches: vi.fn(async () => [{ id: "coach", name: "Fremont Coaches", campus: "Fremont" }]) }));
vi.mock("@/features/counseling-sessions/sessions-workspace", () => ({ SessionsWorkspace: ({ className, coachesRail, isCoachWorkspace }: { className?: string; coachesRail?: ReactNode; isCoachWorkspace?: boolean }) => createElement("div", { "data-sessions": "primary", "data-coach-empty-state": isCoachWorkspace, className }, "Sessions", coachesRail) }));
vi.mock("@/features/counseling-sessions/workspace-rail", () => ({ CampusLeadCoachesRail: ({ coaches }: { coaches: unknown[] }) => createElement("aside", { "data-coaches": coaches.length }, "Coaches") }));
vi.mock("@/features/workspace/workspace-placeholder", () => ({ WorkspacePlaceholder: () => createElement("div", null, "Placeholder") }));
vi.mock("@/features/couple-workspace/queries", () => ({ getCoupleWorkspaceData }));
vi.mock("@/features/prepare-enrich/server", () => ({ getCouplePrepareEnrichDocument: vi.fn(async () => null) }));
vi.mock("@/features/couple-workspace/workspace", () => ({ CoupleWorkspace: ({ data }: { data: { coupleName: string } | null }) => createElement("div", { "data-couple-workspace": "true" }, data?.coupleName) }));
vi.mock("@/components/dashboard/dashboard-header", () => ({ DashboardHeader: () => null }));
vi.mock("@/components/dashboard/attention-panel", () => ({ AttentionPanel: () => null }));
vi.mock("@/components/dashboard/assignment-queue-panel", () => ({ AssignmentQueuePanel: () => null }));
vi.mock("@/components/dashboard/capacity-panel", () => ({ CapacityPanel: () => null }));
vi.mock("@/components/dashboard/metric-card", () => ({ MetricCard: () => null }));
vi.mock("@/components/dashboard/upcoming-panel", () => ({ UpcomingPanel: () => null }));
vi.mock("@/components/dashboard/workflow-panel", () => ({ WorkflowPanel: () => null }));
vi.mock("@/features/dashboard/data", () => ({ dashboardMetrics: [] }));

import WorkspaceRoute from "./page";
import { counselingSessionsGridClassName, counselingSessionsWorkspaceClassName } from "@/features/counseling-sessions/presentation";

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
    expect(counselingSessionsWorkspaceClassName).toContain("xl:grid-cols-[minmax(0,1fr)_280px]");
  });

  it("keeps Sessions as the Coach Workspace default without a Campus Lead rail", async () => {
    state.workspace = "coach";
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-sessions="primary"');
    expect(markup).toContain('data-coach-empty-state="true"');
    expect(markup).not.toContain("data-coaches");
  });

  it("keeps Counselors in the Counseling Workspace without loading Couple data", async () => {
    state.workspace = "counselor";
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-sessions="primary"');
    expect(markup).toContain('data-coach-empty-state="false"');
    expect(markup).not.toContain('data-couple-workspace="true"');
    expect(getCoupleWorkspaceData).not.toHaveBeenCalled();
  });

  it("renders the server-resolved Couple Workspace at the shared entry point", async () => {
    state.workspace = "couple";
    const markup = renderToStaticMarkup(await WorkspaceRoute());
    expect(markup).toContain('data-couple-workspace="true"');
    expect(markup).toContain("Alex &amp; Jordan");
  });
});
