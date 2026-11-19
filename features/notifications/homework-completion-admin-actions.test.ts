import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireRoles: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles: mocks.requireRoles }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));

import { requestHomeworkNotificationRecovery } from "./homework-completion-admin-actions";

const deliveryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Homework recipient delivery manual recovery action", () => {
  afterEach(() => vi.clearAllMocks());

  it("authorizes Admin and targets only the selected recipient delivery", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const formData = new FormData();
    formData.set("deliveryId", deliveryId);

    expect(await requestHomeworkNotificationRecovery({}, formData)).toEqual({ success: true });
    expect(mocks.requireRoles).toHaveBeenCalledWith(["admin", "super_admin"], "/dashboard/attention");
    expect(mocks.rpc).toHaveBeenCalledWith("request_homework_completion_recipient_recovery", { target_delivery_id: deliveryId });
  });

  it("rejects malformed identifiers without making a recovery RPC", async () => {
    const formData = new FormData();
    formData.set("deliveryId", "not-a-delivery-id");
    expect(await requestHomeworkNotificationRecovery({}, formData)).toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
