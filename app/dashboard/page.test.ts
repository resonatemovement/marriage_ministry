import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ roles: ["admin"] as string[], workspaces: ["admin"] as string[] }));
const requireOneOfWorkspaces = vi.hoisted(() => vi.fn(async () => ({ id: "profile", displayName: "Staff", roles: state.roles, workspaces: state.workspaces, onboardingRequired: false, accountStage: "active" as const })));

vi.mock("@/lib/auth/session", () => ({ requireOneOfWorkspaces }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ workspace, activeHref, children }: { workspace: string; activeHref: string; children: ReactNode }) => createElement("div", { "data-workspace": workspace, "data-active-href": activeHref }, children) }));
vi.mock("@/features/dashboard/dashboard-page", () => ({ DashboardPage: ({ identity }: { identity: { roles: string[] } }) => createElement("main", null, identity.roles.includes("campus_lead") ? "Campus Dashboard" : "Admin Dashboard") }));

import SharedDashboardRoute from "./page";

describe("shared Dashboard access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses Admin workspace chrome for Admin and Super Admin global dashboard access", async () => {
    state.roles = ["admin"];
    state.workspaces = ["admin"];
    const markup = renderToStaticMarkup(await SharedDashboardRoute());
    expect(requireOneOfWorkspaces).toHaveBeenCalledWith(["admin", "campus_lead"], "/dashboard");
    expect(markup).toContain('data-workspace="admin" data-active-href="/dashboard"');
    state.roles = ["super_admin"];
    await SharedDashboardRoute();
  });

  it("uses separate Campus Lead chrome while requiring only the approved Dashboard roles", async () => {
    state.roles = ["campus_lead"];
    state.workspaces = ["campus_lead"];
    const markup = renderToStaticMarkup(await SharedDashboardRoute());
    expect(markup).toContain('data-workspace="campus_lead" data-active-href="/dashboard"');
    expect(markup).toContain("Campus Dashboard");
  });
});
