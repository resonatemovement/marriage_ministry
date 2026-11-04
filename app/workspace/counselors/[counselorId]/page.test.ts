import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: "coach" as "coach" | "admin", counselors: [{ id: "counselor-1", name: "John & Stacy Wu", campus: "Oakland" }], detail: { id: "counselor-1", kind: "group", type: "counselors", name: "John & Stacy Wu", campus: "Oakland", members: [{ id: "member-1", name: "John Wu", email: "john@example.test", phone: "5105550101" }, { id: "member-2", name: "Stacy Wu", email: "stacy@example.test", phone: "5105550102" }] } }));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "coach-member", displayName: "Coach", roles: [mocks.workspace], workspaces: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/workspace-queries", () => ({ getCurrentCoachCounselors: vi.fn(async () => mocks.counselors) }));
vi.mock("@/features/counseling-sessions/oversight-queries", () => ({ getCounselingOversightProgress: vi.fn(async () => []) }));
vi.mock("@/features/people/detail-queries", () => ({ getSupervisedTeamDetail: vi.fn(async (teamId: string) => teamId === mocks.detail.id ? mocks.detail : null) }));
vi.mock("@/features/people/people-detail-page", () => ({ PeopleDetailPage: ({ breadcrumbs, detail, readOnlySupervisoryView, context }: { breadcrumbs: { label: string; href?: string }[]; detail: typeof mocks.detail; readOnlySupervisoryView: boolean; context: unknown }) => createElement("div", { "data-breadcrumbs": JSON.stringify(breadcrumbs), "data-read-only": String(readOnlySupervisoryView), "data-context": String(context) }, `${detail.name} ${detail.members.map((member) => member.name).join(" ")}`) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", { "data-workspace": "coach" }, children) }));

import CoachCounselorDetailRoute from "./page";

describe("Coach Counselor detail route", () => {
  beforeEach(() => { mocks.workspace = "coach"; });

  it("shows only the authorized Counselor team and member names, not Couple records", async () => {
    const markup = renderToStaticMarkup(await CoachCounselorDetailRoute({ params: Promise.resolve({ counselorId: "counselor-1" }) }));
    expect(markup).toContain("John &amp; Stacy Wu");
    expect(markup).toContain("John Wu");
    expect(markup).toContain("Stacy Wu");
    expect(markup).toContain('&quot;label&quot;:&quot;Workspace&quot;,&quot;href&quot;:&quot;/workspace&quot;');
    expect(markup).not.toContain("Assigned Couples");
    expect(markup).toContain('data-read-only="true"');
    expect(markup).toContain('data-context="null"');
  });

  it("rejects a team outside active Coach supervision and non-Coach workspaces", async () => {
    mocks.counselors = [];
    await expect(CoachCounselorDetailRoute({ params: Promise.resolve({ counselorId: "not-supervised" }) })).rejects.toThrow("not found");
    mocks.workspace = "admin";
    await expect(CoachCounselorDetailRoute({ params: Promise.resolve({ counselorId: "counselor-1" }) })).rejects.toThrow("redirect:/workspace");
  });
});
