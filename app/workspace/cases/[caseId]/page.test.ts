import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ card: { caseId: "case-1", state: { meeting: undefined } } as { caseId: string; state: { meeting: undefined } } | null, workspace: "counselor" as "counselor" | "couple" }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "profile", displayName: "Counselor", roles: [mocks.workspace], workspaces: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-sessions/queries", () => ({ getCounselingSessionCard: vi.fn(async () => mocks.card) }));
vi.mock("@/features/prepare-enrich/server", () => ({ getCounselorPrepareEnrichDocument: vi.fn(async () => null) }));
vi.mock("@/features/counseling-sessions/dev-reset", () => ({ isDevCounselingProject: vi.fn(() => false) }));
vi.mock("@/features/notifications/meeting-notifications", () => ({ getMeetingNotificationRows: vi.fn(async () => []) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/features/counseling-sessions/couple-detail-page", () => ({ CounselingCoupleDetailPage: ({ card }: { card: { caseId: string } }) => createElement("div", { "data-case": card.caseId }, "Case detail") }));

import CounselingCaseDetailRoute from "./page";

describe("Counseling case detail route", () => {
  it("loads an RLS-authorized counseling case for a counseling workspace", async () => {
    mocks.workspace = "counselor"; mocks.card = { caseId: "case-1", state: { meeting: undefined } };
    const markup = renderToStaticMarkup(await CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-1" }) }));
    expect(markup).toContain('data-case="case-1"');
  });

  it("handles an unavailable case and rejects non-counseling workspaces", async () => {
    mocks.workspace = "counselor"; mocks.card = null;
    await expect(CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-2" }) })).rejects.toThrow("not found");
    mocks.workspace = "couple"; mocks.card = { caseId: "case-1", state: { meeting: undefined } };
    await expect(CounselingCaseDetailRoute({ params: Promise.resolve({ caseId: "case-1" }) })).rejects.toThrow("redirect:/workspace");
  });
});
