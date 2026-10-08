import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspace: "campus_lead" as "campus_lead" | "coach",
  coaches: [{ id: "coach-1", name: "Fremont Coaches", campus: "Fremont" }],
  detail: { id: "coach-1", kind: "group", type: "coaches", name: "Fremont Coaches" },
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "lead", displayName: "Campus Lead", roles: [mocks.workspace], workspaces: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/workspace-queries", () => ({ getCurrentCampusLeadCoaches: vi.fn(async () => mocks.coaches) }));
vi.mock("@/features/people/detail-queries", () => ({ getPeopleDetail: vi.fn(async () => mocks.detail) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", { "data-shell": "workspace" }, children) }));
vi.mock("@/features/people/people-detail-page", () => ({ PeopleDetailPage: ({ breadcrumbs }: { breadcrumbs: { label: string; href?: string }[] }) => createElement("div", { "data-breadcrumbs": JSON.stringify(breadcrumbs) }, "Coach detail") }));

import CounselingCoachDetailRoute from "./page";

describe("Counseling Coach detail route", () => {
  it("keeps an assigned Coach detail in the Counseling Workspace breadcrumb context", async () => {
    mocks.workspace = "campus_lead";
    mocks.coaches = [{ id: "coach-1", name: "Fremont Coaches", campus: "Fremont" }];
    const markup = renderToStaticMarkup(await CounselingCoachDetailRoute({ params: Promise.resolve({ coachId: "coach-1" }) }));
    expect(markup).toContain("Coach detail");
    expect(markup).toContain("Workspace");
    expect(markup).toContain('&quot;label&quot;:&quot;Workspace&quot;,&quot;href&quot;:&quot;/workspace&quot;');
    expect(markup).toContain('&quot;label&quot;:&quot;Coaches&quot;');
    expect(markup).toContain('&quot;label&quot;:&quot;Fremont Coaches&quot;,&quot;current&quot;:true');
    expect(markup).not.toContain('&quot;label&quot;:&quot;Coaches&quot;,&quot;href&quot;');
    expect(markup).not.toContain("People &amp; Teams");
  });

  it("rejects a Coach outside the signed-in Campus Lead's assignments and non-Campus-Lead workspaces", async () => {
    mocks.workspace = "campus_lead";
    mocks.coaches = [];
    await expect(CounselingCoachDetailRoute({ params: Promise.resolve({ coachId: "coach-1" }) })).rejects.toThrow("not found");
    mocks.workspace = "coach";
    await expect(CounselingCoachDetailRoute({ params: Promise.resolve({ coachId: "coach-1" }) })).rejects.toThrow("redirect:/workspace");
  });
});
