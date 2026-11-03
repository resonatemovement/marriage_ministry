import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ card: { caseId: "case-1", partners: [], state: { meeting: undefined } } as { caseId: string; partners: { id: string; name: string }[]; state: { meeting: undefined } } | null, workspace: "counselor" as "counselor" | "campus_lead" | "couple" | "coach" | "admin", roles: ["counselor"] as string[], getCard: vi.fn(async () => mocks.card), getAssessmentManagement: vi.fn(async () => ({ assessments: [], sessions: [], preferences: {} })) }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "profile", displayName: "Counselor", roles: mocks.roles, workspaces: ["admin", "coach", "counselor"] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/queries", () => ({ getCounselingSessionCard: mocks.getCard }));
vi.mock("@/features/counseling-sessions/workspace-queries", () => ({ getCurrentCoachCaseScope: vi.fn(async () => ({ caseIds: ["case-1"], coupleContactCaseIds: [] })) }));
vi.mock("@/features/assessments/counselor-management-queries", () => ({ getCounselorAssessmentManagement: mocks.getAssessmentManagement }));
vi.mock("@/features/prepare-enrich/server", () => ({ getCounselorPrepareEnrichDocument: vi.fn(async () => null) }));
vi.mock("@/features/counseling-sessions/dev-reset", () => ({ isDevCounselingProject: vi.fn(() => false) }));
vi.mock("@/features/notifications/meeting-notifications", () => ({ getMeetingNotificationRows: vi.fn(async () => []) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: vi.fn(async () => ({ data: false, error: null })) }) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/features/counseling-sessions/couple-detail-page", () => ({ CounselingCoupleDetailPage: ({ card, canReadAssessmentResults, canManageAssessmentSchedule }: { card: { caseId: string }; canReadAssessmentResults: boolean; canManageAssessmentSchedule: boolean }) => createElement("div", { "data-case": card.caseId, "data-read-assessment-results": String(canReadAssessmentResults), "data-manage-assessment-schedule": String(canManageAssessmentSchedule) }, "Case detail") }));

import CounselingCaseDetailRoute from "./page";

describe("Counseling case detail route", () => {
  it("loads an RLS-authorized counseling case for a counseling workspace", async () => {
    mocks.workspace = "counselor"; mocks.card = { caseId: "case-1", partners: [], state: { meeting: undefined } };
    mocks.roles = ["counselor"];
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-1" }) }));
    expect(markup).toContain('data-case="case-1"');
    expect(mocks.getCard).toHaveBeenCalledWith("case-1", "counselor");
  });

  it("uses Coach scope for a Coach-only account", async () => {
    mocks.getCard.mockClear();
    mocks.getAssessmentManagement.mockClear();
    mocks.workspace = "coach";
    mocks.roles = ["coach"];
    mocks.card = { caseId: "assigned-case", partners: [], state: { meeting: undefined } };
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "assigned-case" }) }));

    expect(markup).toContain('data-case="assigned-case"');
    expect(markup).toContain('data-read-assessment-results="true"');
    expect(markup).toContain('data-manage-assessment-schedule="false"');
    expect(mocks.getAssessmentManagement).toHaveBeenCalledWith("assigned-case", [], true, null);
    expect(mocks.getCard).toHaveBeenCalledWith("assigned-case", "coach");
  });

  it("allows assigned Campus Lead-of-record staff to read results without scheduling controls", async () => {
    mocks.getAssessmentManagement.mockClear();
    mocks.workspace = "campus_lead";
    mocks.roles = ["campus_lead"];
    mocks.card = { caseId: "campus-lead-case", partners: [], state: { meeting: undefined } };
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "campus-lead-case" }) }));

    expect(markup).toContain('data-read-assessment-results="true"');
    expect(markup).toContain('data-manage-assessment-schedule="false"');
    expect(mocks.getAssessmentManagement).toHaveBeenCalledWith("campus-lead-case", [], true, null);
  });

  it.each([["admin", ["admin"]], ["admin", ["super_admin"]]] as const)("allows authorized %s role result reads and existing scheduling controls", async (workspace, roles) => {
    mocks.getAssessmentManagement.mockClear();
    mocks.workspace = workspace;
    mocks.roles = [...roles];
    mocks.card = { caseId: "admin-case", partners: [], state: { meeting: undefined } };
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "admin-case" }) }));

    expect(markup).toContain('data-read-assessment-results="true"');
    expect(markup).toContain('data-manage-assessment-schedule="true"');
    expect(mocks.getAssessmentManagement).toHaveBeenCalledWith("admin-case", [], true, null);
  });

  it("keeps a multi-role Super Admin's Coach detail lookup in Coach scope", async () => {
    mocks.getCard.mockClear();
    mocks.workspace = "coach";
    mocks.roles = ["super_admin", "coach"];
    mocks.card = { caseId: "case-1", partners: [], state: { meeting: undefined } };
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-1" }) }));

    expect(markup).toContain('data-case="case-1"');
    expect(mocks.getCard).toHaveBeenCalledWith("case-1", "coach");
  });

  it("hides a directly requested Case when it is outside the active Coach scope", async () => {
    mocks.getAssessmentManagement.mockClear();
    mocks.workspace = "coach";
    mocks.roles = ["super_admin", "coach"];
    mocks.card = null;

    await expect(CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "john-stacy-case" }) })).rejects.toThrow("not found");
    expect(mocks.getCard).toHaveBeenCalledWith("john-stacy-case", "coach");
    expect(mocks.getAssessmentManagement).not.toHaveBeenCalled();
  });

  it("keeps the existing Super Admin workspace lookup unscoped", async () => {
    mocks.getCard.mockClear();
    mocks.workspace = "admin";
    mocks.roles = ["super_admin", "coach"];
    mocks.card = { caseId: "global-case", partners: [], state: { meeting: undefined } };
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "global-case" }) }));

    expect(markup).toContain('data-case="global-case"');
    expect(mocks.getCard).toHaveBeenCalledWith("global-case", "admin");
  });

  it("handles an unavailable case and rejects non-counseling workspaces", async () => {
    mocks.workspace = "counselor"; mocks.card = null;
    mocks.roles = ["counselor"];
    await expect(CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-2" }) })).rejects.toThrow("not found");
    mocks.workspace = "couple"; mocks.card = { caseId: "case-1", partners: [], state: { meeting: undefined } };
    await expect(CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-1" }) })).rejects.toThrow("redirect:/workspace");
  });
});
