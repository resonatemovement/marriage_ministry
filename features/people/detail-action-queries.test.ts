import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  groupFilters: [] as Array<{ column: string; value: unknown }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    from: mocks.from,
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  }),
}));

function query(data: unknown, table: string) {
  const result = { data, error: null };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      if (table === "groups") mocks.groupFilters.push({ column, value });
      return builder;
    },
    is: () => builder,
    order: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const coachTeam = {
  kind: "group" as const,
  id: "coach-team-id",
  type: "coaches" as const,
  name: "Coach Team",
  campusId: "campus-1",
  campus: "Fremont",
  updatedAt: "2026-11-01T00:00:00Z",
  members: [],
  counselingStatus: null,
  activeAssignmentCount: 0,
  assignmentSummary: "No active assignments",
  coachAssignment: null,
  counselorAssignment: null,
  campusLeadAssignment: null,
  supervisionSummary: "Not applicable",
  operationalStatuses: [],
  assignedCouples: [],
};

describe("Campus Lead assignment candidate query", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.rpc.mockReset();
    mocks.getClaims.mockReset();
    mocks.groupFilters.length = 0;
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "lead-profile-id" } }, error: null });
    mocks.from.mockImplementation((table: string) => query(table === "campuses" ? [] : table === "groups" ? null : [], table));
  });

  it("uses the scoped RPC for Couple identities and does not query unassigned Couple profiles", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        couple_group_id: "eligible-couple-id",
        group_name: "Stale group label",
        assignment_eligible: true,
        partners: [
          { firstName: "Ellen", lastName: "Parker", gender: "female" },
          { firstName: "Matt", lastName: "Murdock", gender: "male" },
        ],
      }],
      error: null,
    });
    const { getPeopleDetailActionContext } = await import("./detail-action-queries");

    const context = await getPeopleDetailActionContext(coachTeam, "campus_lead");

    expect(mocks.rpc).toHaveBeenCalledWith("get_campus_lead_assignment_candidates", { target_campus_id: "campus-1" });
    expect(context.eligibleCouples).toEqual([{ id: "eligible-couple-id", name: "Matt Murdock & Ellen Parker" }]);
    expect(mocks.groupFilters).not.toContainEqual({ column: "group_type", value: "couple" });
    expect(mocks.from).not.toHaveBeenCalledWith("invitations");
  });

  it("leaves the Admin candidate query contract on its existing profile-backed path", async () => {
    const { getPeopleDetailActionContext } = await import("./detail-action-queries");

    await getPeopleDetailActionContext(coachTeam, "admin");

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.groupFilters).toContainEqual({ column: "group_type", value: "couple" });
    expect(mocks.from).toHaveBeenCalledWith("invitations");
  });
});
