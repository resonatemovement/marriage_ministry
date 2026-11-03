import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: "coach" as "coach" | "admin", detail: { id: "counselor-1", name: "John & Stacy Wu", campus: "Oakland", members: [{ id: "member-1", name: "John Wu" }, { id: "member-2", name: "Stacy Wu" }] } }));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "coach-member", displayName: "Coach", roles: [mocks.workspace], workspaces: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/workspace-queries", () => ({ getCurrentCoachCounselorDetail: vi.fn(async (teamId: string) => teamId === mocks.detail.id ? mocks.detail : null) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", { "data-workspace": "coach" }, children) }));

import CoachCounselorDetailRoute from "./page";

describe("Coach Counselor detail route", () => {
  beforeEach(() => { mocks.workspace = "coach"; });

  it("shows only the authorized Counselor team and member names, not Couple records", async () => {
    const markup = renderToStaticMarkup(await CoachCounselorDetailRoute({ params: Promise.resolve({ counselorId: "counselor-1" }) }));
    expect(markup).toContain("John &amp; Stacy Wu");
    expect(markup).toContain("Counselor · Oakland");
    expect(markup).toContain("John Wu");
    expect(markup).toContain("Stacy Wu");
    expect(markup).toContain('href="/workspace">Workspace</a>');
    expect(markup).not.toContain("Assigned Couples");
  });

  it("rejects a team outside active Coach supervision and non-Coach workspaces", async () => {
    await expect(CoachCounselorDetailRoute({ params: Promise.resolve({ counselorId: "not-supervised" }) })).rejects.toThrow("not found");
    mocks.workspace = "admin";
    await expect(CoachCounselorDetailRoute({ params: Promise.resolve({ counselorId: "counselor-1" }) })).rejects.toThrow("redirect:/workspace");
  });
});
