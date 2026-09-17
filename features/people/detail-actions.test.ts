import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  revalidatePath: vi.fn(),
  requireWorkspace: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfWorkspaces: vi.fn(), requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));

const coupleId = "11111111-1111-1111-1111-111111111111";
const providerId = "22222222-2222-2222-2222-222222222222";

function formData(providerGroupId?: string) {
  const form = new FormData();
  form.set("coupleGroupId", coupleId);
  if (providerGroupId) form.set("providerGroupId", providerGroupId);
  return form;
}

function query(data: unknown) {
  const result = { data, error: null };
  return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => result }) }), maybeSingle: async () => result }) }) };
}

describe("unassignCounselorOfRecord", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.requireWorkspace.mockReset();
    mocks.rpc.mockReset();
    mocks.requireWorkspace.mockResolvedValue(undefined);
  });

  it("uses the canonical mutation after provider preflight and refreshes both relationship details", async () => {
    mocks.from.mockImplementation((table: string) => table === "groups" ? query({ id: coupleId }) : query({ case_assignments: [{ assigned_group_id: providerId, assignment_type: "counselor", ended_at: null }] }));
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { unassignCounselorOfRecord } = await import("./detail-actions");

    await expect(unassignCounselorOfRecord(formData(providerId))).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unassign_counseling_case", { target_couple_group_id: coupleId });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${coupleId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${providerId}`);
  });

  it("keeps the Couple-side action on the same canonical mutation without provider state", async () => {
    mocks.from.mockReturnValue(query({ id: coupleId }));
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { unassignCounselorOfRecord } = await import("./detail-actions");

    await expect(unassignCounselorOfRecord(formData())).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unassign_counseling_case", { target_couple_group_id: coupleId });
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(`/people/${providerId}`);
  });

  it("does not call the mutation for a stale provider assignment", async () => {
    mocks.from.mockImplementation((table: string) => table === "groups" ? query({ id: coupleId }) : query({ case_assignments: [] }));
    const { unassignCounselorOfRecord } = await import("./detail-actions");

    await expect(unassignCounselorOfRecord(formData(providerId))).resolves.toEqual({ error: "This Couple is no longer assigned to this team." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
