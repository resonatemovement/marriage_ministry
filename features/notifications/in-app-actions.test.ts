import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireOneOfRoles: vi.fn(), rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles: mocks.requireOneOfRoles }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));

import { markInAppNotificationRead } from "./in-app-actions";

describe("markInAppNotificationRead server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOneOfRoles.mockResolvedValue({ id: "partner-a", roles: ["couple"] });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("delegates recipient ownership to the narrow database RPC", async () => {
    await expect(markInAppNotificationRead("notification-1")).resolves.toEqual({ success: true });
    expect(mocks.requireOneOfRoles).toHaveBeenCalledWith(["couple"], "/workspace");
    expect(mocks.rpc).toHaveBeenCalledWith("mark_in_app_notification_read", { target_notification_id: "notification-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace");
  });

  it("does not treat another recipient's notification as marked", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(markInAppNotificationRead("other-notification")).resolves.toEqual({ success: false });
  });
});
