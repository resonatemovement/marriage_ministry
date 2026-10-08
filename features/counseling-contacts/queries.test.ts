import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));

import { getCounselingContactDetail, getCurrentCoupleCounselor } from "./queries";

describe("counseling contact RPC queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes contact RPCs through the Supabase client instance", async () => {
    const client = {
      rpc: vi.fn(function (this: unknown, name: string) {
        if (this !== client) throw new TypeError("RPC lost its client context");
        return Promise.resolve({
          data: name === "get_current_couple_case_counselor"
            ? [{ counseling_case_id: "case-id", counselor_group_id: "group-id", counselor_name: "Counselor Team" }]
            : [],
          error: null,
        });
      }),
    };
    createServerSupabaseClient.mockResolvedValue(client);

    await expect(getCurrentCoupleCounselor()).resolves.toEqual({ caseId: "case-id", id: "group-id", name: "Counselor Team" });
    await expect(getCounselingContactDetail("case-id", "group-id")).resolves.toBeNull();
    expect(client.rpc.mock.contexts).toEqual([client, client]);
  });
});
