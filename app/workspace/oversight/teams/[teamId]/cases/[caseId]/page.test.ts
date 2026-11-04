import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: "coach" as "coach" | "campus_lead" | "admin" | "counselor", cases: [{ caseId: "case-1", coupleName: "A & B", teamName: "Counselor Team", caseStatus: "active", sessionProgress: "Session 2 of 8", nextMeetingAt: null, homeworkStatus: "Complete" }] }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "staff", roles: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/oversight-queries", () => ({ getCounselingOversightProgress: vi.fn(async () => mocks.cases) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));

import CounselingOversightCaseRoute from "./page";

describe("read-only counseling oversight route", () => {
  beforeEach(() => { mocks.workspace = "coach"; });

  it("renders only the approved progress summary under the active workspace", async () => {
    const markup = renderToStaticMarkup(await CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "team", caseId: "case-1" }) }));
    expect(markup).toContain("A &amp; B");
    expect(markup).toContain("Counselor Team");
    expect(markup).toContain("Session 2 of 8");
    expect(markup).toContain("Homework completion");
    expect(markup).not.toContain("Homework answers");
  });

  it("denies counselor workspace and Cases outside the database-returned team scope", async () => {
    mocks.workspace = "counselor";
    await expect(CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "team", caseId: "case-1" }) })).rejects.toThrow("redirect:/workspace");
    mocks.workspace = "coach";
    await expect(CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "unrelated", caseId: "missing" }) })).rejects.toThrow("not found");
  });
});
