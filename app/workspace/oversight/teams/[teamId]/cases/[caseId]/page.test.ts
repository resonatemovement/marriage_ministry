import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: "coach" as "coach" | "campus_lead" | "admin" | "counselor", cases: [{ caseId: "case-1", coupleName: "A & B", teamName: "Counselor Team", caseStatus: "active", sessionProgress: "Session 2 of 8", nextMeetingAt: null, homeworkStatus: "Complete" }], identity: null as { coupleName: string; partners: { id: string; name: string; gender: "male" | "female" | null; photoUrl: string | null }[] } | null, identityQuery: vi.fn(async () => mocks.identity) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "staff", roles: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/oversight-queries", () => ({ getCounselingOversightProgress: vi.fn(async () => mocks.cases), getCounselingOversightIdentity: mocks.identityQuery }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));

import CounselingOversightCaseRoute from "./page";

describe("read-only counseling oversight route", () => {
  beforeEach(() => { mocks.workspace = "coach"; mocks.identityQuery.mockClear(); });

  it("renders only the approved progress summary under the active workspace", async () => {
    const markup = renderToStaticMarkup(await CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "team", caseId: "case-1" }) }));
    expect(markup).toContain("A &amp; B");
    expect(markup).toContain("Counselor Team");
    expect(markup).toContain("Session 2 of 8");
    expect(markup).toContain("Homework completion");
    expect(markup).not.toContain("View Answers");
    expect(markup).toContain('href="/workspace"');
    expect(markup).toContain('role="progressbar"');
    expect(mocks.identityQuery).toHaveBeenCalledWith("team", "case-1");
  });

  it("uses authorized ordered partner identity and photos when available", async () => {
    mocks.identity = { coupleName: "John & Annie", partners: [{ id: "john", name: "John Lyra", gender: "male", photoUrl: "https://photos.test/john" }, { id: "annie", name: "Annie Chung", gender: "female", photoUrl: "https://photos.test/annie" }] };
    const markup = renderToStaticMarkup(await CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "team", caseId: "case-1" }) }));
    expect(markup).toContain("John Lyra &amp; Annie Chung");
    expect(markup).toContain("https://photos.test/john");
    expect(markup).toContain("https://photos.test/annie");
    mocks.identity = null;
  });

  it("denies counselor workspace and Cases outside the database-returned team scope", async () => {
    mocks.workspace = "counselor";
    await expect(CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "team", caseId: "case-1" }) })).rejects.toThrow("redirect:/workspace");
    mocks.workspace = "coach";
    await expect(CounselingOversightCaseRoute({ params: Promise.resolve({ teamId: "unrelated", caseId: "missing" }) })).rejects.toThrow("not found");
  });
});
