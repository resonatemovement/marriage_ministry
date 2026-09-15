import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteAuthIdentity: vi.fn(),
  removePhotos: vi.fn(),
  requireWorkspace: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnvironment: () => ({ url: "https://example.supabase.co" }) }));
vi.mock("@/features/people/invitation-delivery", () => ({ deleteAuthIdentity: mocks.deleteAuthIdentity }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    storage: { from: () => ({ remove: mocks.removePhotos }) },
  }),
}));

import { deleteIntakeRequest } from "./delete-actions";

describe("deleteIntakeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SECRET_KEY = "test-service-key";
    mocks.requireWorkspace.mockResolvedValue({ roles: ["admin", "super_admin"] });
    mocks.rpc.mockResolvedValue({ data: { profile_ids: ["profile-1"], auth_user_ids: ["auth-1"] }, error: null });
    mocks.removePhotos.mockResolvedValue({ error: null });
    mocks.deleteAuthIdentity.mockResolvedValue({ error: null });
  });

  it("allows a Super Admin and starts external cleanup only after the DB RPC returns", async () => {
    await expect(deleteIntakeRequest("intake-1")).resolves.toEqual({ success: true });

    expect(mocks.requireWorkspace).toHaveBeenCalledWith("admin", "/intake-requests");
    expect(mocks.rpc).toHaveBeenCalledWith("delete_disposable_intake_graph", { target_intake_id: "intake-1" });
    expect(mocks.removePhotos).toHaveBeenCalledWith(["profiles/profile-1/avatar.avif", "profiles/profile-1/avatar.webp"]);
    expect(mocks.deleteAuthIdentity).toHaveBeenCalledWith("auth-1");
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.removePhotos.mock.invocationCallOrder[0]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteAuthIdentity.mock.invocationCallOrder[0]);
  });

  it("denies an Admin without Super Admin capability before invoking the deletion client", async () => {
    mocks.requireWorkspace.mockResolvedValue({ roles: ["admin"] });

    await expect(deleteIntakeRequest("intake-1")).resolves.toEqual({ error: "Only Super Admins may permanently delete Intake Requests." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("denies another role through the authoritative workspace guard", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("Not authorized"));

    await expect(deleteIntakeRequest("intake-1")).rejects.toThrow("Not authorized");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps storage and Auth cleanup untouched when retained history blocks the DB RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "intake_delete_blocker:counseling_case_history" } });

    await expect(deleteIntakeRequest("intake-1")).resolves.toEqual({
      error: "This Intake Request’s generated Couple has retained counseling case history and cannot be permanently deleted.",
    });
    expect(mocks.removePhotos).not.toHaveBeenCalled();
    expect(mocks.deleteAuthIdentity).not.toHaveBeenCalled();
  });
});
