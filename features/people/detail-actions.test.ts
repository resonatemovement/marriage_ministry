import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  revalidatePath: vi.fn(),
  requireWorkspace: vi.fn(),
  rpc: vi.fn(),
  filters: [] as { table: string; method: string; column: string; value: unknown }[],
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

function editFormData(name: string) {
  const form = new FormData();
  form.set("recordId", coupleId);
  form.set("name", name);
  form.set("campusId", "");
  return form;
}

function query(data: unknown, table = "unknown") {
  const result = { data, error: null };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { mocks.filters.push({ table, method: "eq", column, value }); return builder; },
    is: (column: string, value: unknown) => { mocks.filters.push({ table, method: "is", column, value }); return builder; },
    maybeSingle: async () => result,
  };
  return builder;
}

describe("unassignCounselorOfRecord", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.requireWorkspace.mockReset();
    mocks.rpc.mockReset();
    mocks.filters.length = 0;
    mocks.requireWorkspace.mockResolvedValue(undefined);
  });

  it("uses the canonical mutation after provider preflight and refreshes both relationship details", async () => {
    mocks.from.mockImplementation((table: string) => table === "groups" ? query({ id: coupleId }, table) : query({ case_assignments: [{ assigned_group_id: providerId, assignment_type: "counselor", ended_at: null }] }, table));
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { unassignCounselorOfRecord } = await import("./detail-actions");

    await expect(unassignCounselorOfRecord(formData(providerId))).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unassign_counseling_case", { target_couple_group_id: coupleId });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${coupleId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${providerId}`);
  });

  it("keeps the Couple-side action on the same canonical mutation without provider state", async () => {
    mocks.from.mockReturnValue(query({ id: coupleId }, "groups"));
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { unassignCounselorOfRecord } = await import("./detail-actions");

    await expect(unassignCounselorOfRecord(formData())).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unassign_counseling_case", { target_couple_group_id: coupleId });
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(`/people/${providerId}`);
  });

  it("does not call the mutation for a stale provider assignment", async () => {
    mocks.from.mockImplementation((table: string) => table === "groups" ? query({ id: coupleId }, table) : query({ case_assignments: [] }, table));
    const { unassignCounselorOfRecord } = await import("./detail-actions");

    await expect(unassignCounselorOfRecord(formData(providerId))).resolves.toEqual({ error: "This Couple is no longer assigned to this team." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("unassignCoachCaseAssignment", () => {
  const caseId = "33333333-3333-3333-3333-333333333333";
  const coachGroupId = "44444444-4444-4444-4444-444444444444";
  const coachFormData = () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("caseId", caseId);
    form.set("providerGroupId", coachGroupId);
    return form;
  };

  beforeEach(() => {
    mocks.from.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.requireWorkspace.mockReset();
    mocks.rpc.mockReset();
    mocks.filters.length = 0;
    mocks.requireWorkspace.mockResolvedValue(undefined);
  });

  it("targets the current active Coach assignment by case and team, then refreshes both workspaces", async () => {
    mocks.from.mockImplementation((table: string) => table === "groups"
      ? query({ id: coupleId }, table)
      : table === "counseling_cases"
        ? query({ id: caseId, couple_group_id: coupleId }, table)
        : query({ id: "active-coach-assignment" }, table));
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { unassignCoachCaseAssignment } = await import("./detail-actions");

    await expect(unassignCoachCaseAssignment(coachFormData())).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("unassign_coach_case_assignment", { target_case_id: caseId, target_group_id: coachGroupId });
    expect(mocks.rpc).not.toHaveBeenCalledWith("unassign_counseling_case", expect.anything());
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "eq", column: "counseling_case_id", value: caseId });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "eq", column: "assigned_group_id", value: coachGroupId });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "eq", column: "assignment_type", value: "coach" });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "is", column: "ended_at", value: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${coachGroupId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace");
  });

  it("returns the existing stale-assignment message when no active Coach assignment remains", async () => {
    mocks.from.mockImplementation((table: string) => table === "groups"
      ? query({ id: coupleId }, table)
      : table === "counseling_cases"
        ? query({ id: caseId, couple_group_id: coupleId }, table)
        : query(null, table));
    const { unassignCoachCaseAssignment } = await import("./detail-actions");

    await expect(unassignCoachCaseAssignment(coachFormData())).resolves.toEqual({ error: "This Couple is no longer assigned to this team." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("updatePeopleDetail Couple names", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.requireWorkspace.mockReset();
    mocks.rpc.mockReset();
    mocks.requireWorkspace.mockResolvedValue(undefined);
  });

  function groupEditQuery() {
    let updateValue: unknown;
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: { id: coupleId, campus_id: null, group_type: "couple", group_members: [
        { ended_at: null, profile: { first_name: "Jordan", last_name: "Lee", email: "jordan@example.test" } },
        { ended_at: null, profile: { first_name: "Casey", last_name: "Lee", email: "casey@example.test" } },
      ], invitations: [] }, error: null }),
      update: (value: unknown) => { updateValue = value; return builder; },
      then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
      getUpdateValue: () => updateValue,
    };
    return builder;
  }

  it("saves a custom Couple display name without editing either profile", async () => {
    const groupQuery = groupEditQuery();
    mocks.from.mockReturnValue(groupQuery);
    const { updatePeopleDetail } = await import("./detail-actions");

    await expect(updatePeopleDetail(editFormData("Lee Family"))).resolves.toEqual({ success: true });
    expect(groupQuery.getUpdateValue()).toEqual({ name: "Lee Family", campus_id: null });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith("groups");
  });

  it("clears a Couple display override by restoring the derived partner name", async () => {
    const groupQuery = groupEditQuery();
    mocks.from.mockReturnValue(groupQuery);
    const { updatePeopleDetail } = await import("./detail-actions");

    await expect(updatePeopleDetail(editFormData(""))).resolves.toEqual({ success: true });
    expect(groupQuery.getUpdateValue()).toEqual({ name: "Jordan Lee & Casey Lee", campus_id: null });
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith("groups");
  });
});
