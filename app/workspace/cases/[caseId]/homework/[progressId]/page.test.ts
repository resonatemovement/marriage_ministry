import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCard: vi.fn(async (): Promise<{ caseId: string; partners: { id: string; firstName: string; name: string }[] } | null> => ({ caseId: "assigned-case", partners: [{ id: "partner", firstName: "Alex", name: "Alex Example" }] })),
  getReview: vi.fn(async () => ({ caseId: "assigned-case", profileId: "partner" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("not found"); }), redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("@/lib/auth/session", () => ({ requireActiveWorkspace: vi.fn(async () => ({ identity: { id: "multi-role", displayName: "Test Multi Role", roles: ["super_admin", "coach"], workspaces: ["admin", "coach"] }, workspace: "coach" })) }));
vi.mock("@/features/counseling-sessions/queries", () => ({ getCounselingSessionCard: mocks.getCard, getCounselorSubmittedHomeworkReview: mocks.getReview }));
vi.mock("@/components/navigation/workspace-shell", () => ({ WorkspaceShell: () => null }));
vi.mock("@/features/counseling-sessions/submitted-homework-review-page", () => ({ SubmittedHomeworkReviewPage: () => null }));

import SubmittedHomeworkReviewRoute from "./page";

describe("Submitted Homework review Coach scope", () => {
  it("uses the active Coach workspace when resolving the Case for a multi-role account", async () => {
    await SubmittedHomeworkReviewRoute({ params: Promise.resolve({ caseId: "assigned-case", progressId: "submitted-progress" }) });

    expect(mocks.getCard).toHaveBeenCalledWith("assigned-case", "coach");
    expect(mocks.getReview).toHaveBeenCalledWith("submitted-progress");
  });

  it("does not request submitted answers when the Case is outside Coach scope", async () => {
    mocks.getReview.mockClear();
    mocks.getCard.mockResolvedValueOnce(null);

    await expect(SubmittedHomeworkReviewRoute({ params: Promise.resolve({ caseId: "unassigned-case", progressId: "private-progress" }) })).rejects.toThrow("not found");

    expect(mocks.getReview).not.toHaveBeenCalled();
  });
});
