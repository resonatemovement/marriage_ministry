import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireOneOfRoles: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles: mocks.requireOneOfRoles }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));

import { reopenParticipantHomework } from "./homework-reopen-actions";

describe("reopenParticipantHomework server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOneOfRoles.mockResolvedValue({ id: "counselor-a", roles: ["counselor"] });
    mocks.rpc.mockResolvedValue({ data: "case-session-1", error: null });
  });

  it("uses the atomic RPC and refreshes the affected Case and Couple Session", async () => {
    await expect(reopenParticipantHomework("case-1", "progress-1")).resolves.toEqual({ success: true });
    expect(mocks.requireOneOfRoles).toHaveBeenCalledWith(["counselor", "admin", "super_admin"], "/workspace");
    expect(mocks.rpc).toHaveBeenCalledWith("reopen_participant_homework", { target_case_id: "case-1", target_progress_id: "progress-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace/cases/case-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace/cases/case-1/homework/progress-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace/sessions/[caseSessionId]", "page");
  });

  it("does not revalidate or report success when the RPC rejects a stale or unauthorized request", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001" } });
    await expect(reopenParticipantHomework("case-1", "progress-1")).resolves.toEqual({ success: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
