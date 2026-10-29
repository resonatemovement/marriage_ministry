import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  revalidatePath: vi.fn(),
  requireWorkspace: vi.fn(),
  requireOneOfWorkspaces: vi.fn(),
  rpc: vi.fn(),
  filters: [] as { table: string; method: string; column: string; value: unknown }[],
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfWorkspaces: mocks.requireOneOfWorkspaces, requireWorkspace: mocks.requireWorkspace }));
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

describe("updateCouplePartnerGender", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.requireOneOfWorkspaces.mockReset();
    mocks.rpc.mockReset();
  });

  it("uses the narrow authorized RPC and refreshes Couple surfaces", async () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("profileId", providerId);
    form.set("gender", "female");
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { updateCouplePartnerGender } = await import("./detail-actions");

    await expect(updateCouplePartnerGender(form)).resolves.toEqual({ success: true });
    expect(mocks.requireOneOfWorkspaces).toHaveBeenCalledWith(["admin", "counselor"], `/people/${coupleId}`);
    expect(mocks.rpc).toHaveBeenCalledWith("update_couple_partner_gender", { target_couple_group_id: coupleId, target_profile_id: providerId, target_gender: "female" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${coupleId}`);
  });

  it("rejects invalid gender before calling the database", async () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("profileId", providerId);
    form.set("gender", "unknown");
    const { updateCouplePartnerGender } = await import("./detail-actions");

    await expect(updateCouplePartnerGender(form)).resolves.toEqual({ error: "Choose a valid gender." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the database rejects an unauthorized gender update", async () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("profileId", providerId);
    form.set("gender", "male");
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Not authorized to update this Couple" } });
    const { updateCouplePartnerGender } = await import("./detail-actions");

    await expect(updateCouplePartnerGender(form)).resolves.toEqual({ error: "The change could not be saved. Please try again." });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("updateCouplePartnerDetails", () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset();
    mocks.requireOneOfWorkspaces.mockReset();
    mocks.rpc.mockReset();
  });

  it("validates and sends only editable profile fields through the authorized RPC", async () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("profileId", providerId);
    form.set("firstName", "Taylor");
    form.set("lastName", "Chen");
    form.set("phone", "(555) 555-1212");
    form.set("gender", "female");
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { updateCouplePartnerDetails } = await import("./detail-actions");

    await expect(updateCouplePartnerDetails(form)).resolves.toEqual({ success: true });
    expect(mocks.requireOneOfWorkspaces).toHaveBeenCalledWith(["admin", "counselor"], `/people/${coupleId}`);
    expect(mocks.rpc).toHaveBeenCalledWith("update_couple_partner_details", {
      target_couple_group_id: coupleId,
      target_profile_id: providerId,
      target_first_name: "Taylor",
      target_last_name: "Chen",
      target_phone: "+15555551212",
      target_gender: "female",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/people/${coupleId}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace/contacts");
  });

  it("keeps legacy null gender nullable while validating required names and phone", async () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("profileId", providerId);
    form.set("firstName", "Taylor");
    form.set("lastName", "Chen");
    form.set("phone", "5555551212");
    form.set("gender", "");
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { updateCouplePartnerDetails } = await import("./detail-actions");

    await expect(updateCouplePartnerDetails(form)).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith("update_couple_partner_details", expect.objectContaining({ target_gender: null }));
  });

  it("rejects malformed details before RPC and fails closed on database authorization errors", async () => {
    const form = new FormData();
    form.set("coupleGroupId", coupleId);
    form.set("profileId", providerId);
    form.set("firstName", "Taylor");
    form.set("lastName", "Chen");
    form.set("phone", "555");
    form.set("gender", "unknown");
    const { updateCouplePartnerDetails } = await import("./detail-actions");

    await expect(updateCouplePartnerDetails(form)).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.rpc).not.toHaveBeenCalled();

    form.set("phone", "5555551212");
    form.set("gender", "male");
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Not authorized to update this Couple" } });
    await expect(updateCouplePartnerDetails(form)).resolves.toEqual({ error: "The change could not be saved. Please try again." });
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
