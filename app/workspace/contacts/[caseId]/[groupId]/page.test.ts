import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: "counselor" as "counselor" | "couple" | "admin", detail: { id: "counselor-team", name: "Taylor & Jordan", kind: "team" as const, roleLabel: "Counselor", campus: "Fremont", members: [] } as { id: string; name: string; kind: "team" | "couple"; roleLabel: string; campus: string | null; members: never[] } | null, getContact: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "profile", displayName: "Counselor", roles: [mocks.workspace], workspaces: [mocks.workspace] }, workspace: mocks.workspace })) }));
vi.mock("@/features/counseling-contacts/queries", () => ({ getCounselingContactDetail: (...args: [string, string]) => mocks.getContact(...args) }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/features/people/read-only-contact-detail", () => ({ ReadOnlyContactDetailPage: ({ breadcrumbs }: { breadcrumbs: { label: string }[] }) => createElement("div", { "data-breadcrumbs": JSON.stringify(breadcrumbs) }, "Read-only contact") }));

import CounselingContactDetailRoute from "./page";

describe("Counseling contact detail route", () => {
  it.each([
    ["Coach", "coach-team"],
    ["Counselor", "counselor-team"],
  ])("resolves an authorized Counselor's %s link using the case and assigned group IDs", async (role, groupId) => {
    mocks.workspace = "counselor";
    mocks.detail = { id: groupId, name: `${role} Team`, kind: "team", roleLabel: role, campus: "Fremont", members: [] };
    mocks.getContact.mockResolvedValue(mocks.detail);

    const markup = renderToStaticMarkup(await CounselingContactDetailRoute({ params: Promise.resolve({ caseId: "case-1", groupId }) }));

    expect(markup).toContain(`${role} Team`);
    expect(mocks.getContact).toHaveBeenCalledWith("case-1", groupId);
    mocks.getContact.mockClear();
  });

  it("uses the secure case-aware query for Counseling Team and Couple contact views", async () => {
    mocks.workspace = "counselor"; mocks.detail = { id: "couple", name: "Alex & Jordan", kind: "couple", roleLabel: "Couple", campus: "Fremont", members: [] };
    mocks.getContact.mockResolvedValue(mocks.detail);
    const markup = renderToStaticMarkup(await CounselingContactDetailRoute({ params: Promise.resolve({ caseId: "case-1", groupId: "couple" }) }));
    expect(markup).toContain("Read-only contact");
    expect(markup).toContain("Sessions");
    expect(markup).not.toContain("People &amp; Teams");
  });

  it("rejects unavailable contacts and non-counseling workspaces", async () => {
    mocks.workspace = "counselor"; mocks.detail = null;
    mocks.getContact.mockResolvedValue(null);
    await expect(CounselingContactDetailRoute({ params: Promise.resolve({ caseId: "case-1", groupId: "other" }) })).rejects.toThrow("not found");
    mocks.workspace = "admin"; mocks.detail = { id: "counselor-team", name: "Taylor & Jordan", kind: "team", roleLabel: "Counselor", campus: "Fremont", members: [] };
    mocks.getContact.mockResolvedValue(mocks.detail);
    await expect(CounselingContactDetailRoute({ params: Promise.resolve({ caseId: "case-1", groupId: "counselor-team" }) })).rejects.toThrow("redirect:/workspace");
  });
});
