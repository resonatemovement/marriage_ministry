import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));

import { getCounselingContactDetail, getCurrentCoupleCounselor } from "./queries";

describe("counseling contact RPC queries", () => {
  beforeEach(() => vi.clearAllMocks());

  const coupleRows = () => [
    { group_id: "couple-id", group_name: "Pending Couple invitation", group_type: "couple", assignment_type: "couple", campus_name: "Test Campus", member_id: "female-id", first_name: "Alex", last_name: "Partner", email: "alex@example.test", phone: null, photo_path: null, profile_status: "active", onboarding_completed_at: "2026-01-01T00:00:00Z", roles: ["couple"], gender: "female", case_status: "in_progress" },
    { group_id: "couple-id", group_name: "Pending Couple invitation", group_type: "couple", assignment_type: "couple", campus_name: "Test Campus", member_id: "male-id", first_name: "Jamie", last_name: "Partner", email: "jamie@example.test", phone: null, photo_path: null, profile_status: "active", onboarding_completed_at: "2026-01-01T00:00:00Z", roles: ["couple"], gender: "male", case_status: "in_progress" },
  ];

  function mockContactRows(data: unknown) {
    createServerSupabaseClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data, error: null }) });
  }

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

  it("derives Couple identity from the ordered participant profiles instead of the stale invitation group name", async () => {
    mockContactRows(coupleRows());

    const detail = await getCounselingContactDetail("case-id", "couple-id");

    expect(detail?.name).toBe("Jamie Partner & Alex Partner");
    expect(detail?.members.map(({ id, gender }) => [id, gender])).toEqual([
      ["male-id", "male"],
      ["female-id", "female"],
    ]);
  });

  it("uses the authoritative contact completion timestamp even when the contact projection lacks campus ID", async () => {
    mockContactRows(coupleRows());

    const detail = await getCounselingContactDetail("case-id", "couple-id");

    expect(detail?.members.every((member) => member.onboardingComplete && member.onboardingStatus === "Onboarding Complete")).toBe(true);
  });

  it("keeps an explicit missing completion timestamp incomplete", async () => {
    mockContactRows(coupleRows().map((row) => ({ ...row, onboarding_completed_at: null })));

    const detail = await getCounselingContactDetail("case-id", "couple-id");

    expect(detail?.members.every((member) => !member.onboardingComplete && member.onboardingStatus === "Onboarding Incomplete")).toBe(true);
  });

  it("keeps onboarding completion independent from account deactivation", async () => {
    mockContactRows(coupleRows().map((row) => ({ ...row, profile_status: "deactivated" })));

    const detail = await getCounselingContactDetail("case-id", "couple-id");

    expect(detail?.members.every((member) => member.accountStatus === "Deactivated" && member.onboardingComplete)).toBe(true);
  });

  it("does not claim incomplete onboarding when the authorized query omits the authoritative timestamp field", async () => {
    mockContactRows(coupleRows().map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "onboarding_completed_at"))));

    await expect(getCounselingContactDetail("case-id", "couple-id")).rejects.toThrow("Counseling contact onboarding status is unavailable");
  });

  it("preserves the stored name for care-team contacts", async () => {
    mockContactRows(coupleRows().map((row) => ({ ...row, group_id: "team-id", group_name: "Counselor Team", group_type: "counselor_team", assignment_type: "counselor" })));

    const detail = await getCounselingContactDetail("case-id", "team-id");

    expect(detail?.name).toBe("Counselor Team");
    expect(detail?.kind).toBe("team");
  });
});
