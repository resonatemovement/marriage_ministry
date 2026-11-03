import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filters: [] as { table: string; method: string; args: unknown[] }[],
  coachTeams: [{ id: "coach-team" }],
  counselorAssignments: [
    { counselor_group: { id: "counselor-b", name: "Zed & Amy", group_type: "counselor_team", active: true, campus: { name: "Fremont" } } },
    { counselor_group: { id: "counselor-a", name: "John & Stacy Wu", group_type: "counselor_team", active: true, campus: { name: "Oakland" } } },
    { counselor_group: { id: "coach-other", name: "Other Coaches", group_type: "coach_team", active: true, campus: null } },
    { counselor_group: { id: "inactive-counselor", name: "Inactive", group_type: "counselor_team", active: false, campus: null } },
  ],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "coach-member" } }, error: null }) },
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      query.select = (columns: string) => { mocks.filters.push({ table, method: "select", args: [columns] }); return query; };
      for (const method of ["select", "eq", "is", "in"]) {
        if (method === "select") continue;
        query[method] = (...args: unknown[]) => {
          mocks.filters.push({ table, method, args });
          return query;
        };
      }
      const result = () => {
        if (table === "groups") return mocks.coachTeams;
        if (table === "supervision_assignments") return mocks.counselorAssignments;
        return [
          { counseling_case_id: "john-stacy", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
          { counseling_case_id: "annie-john", assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: null },
        ];
      };
      query.maybeSingle = () => Promise.resolve({ data: result(), error: null });
      query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        return Promise.resolve({ data: result(), error: null }).then(resolve, reject);
      };
      return query;
    },
  }),
}));

import { getCurrentCoachCaseScope, getCurrentCoachCounselors } from "./workspace-queries";

describe("current Coach counseling scope query", () => {
  beforeEach(() => {
    mocks.filters.length = 0;
    mocks.counselorAssignments = [
      { counselor_group: { id: "counselor-b", name: "Zed & Amy", group_type: "counselor_team", active: true, campus: { name: "Fremont" } } },
      { counselor_group: { id: "counselor-a", name: "John & Stacy Wu", group_type: "counselor_team", active: true, campus: { name: "Oakland" } } },
      { counselor_group: { id: "coach-other", name: "Other Coaches", group_type: "coach_team", active: true, campus: null } },
      { counselor_group: { id: "inactive-counselor", name: "Inactive", group_type: "counselor_team", active: false, campus: null } },
    ];
  });

  it("queries active Counselor-of-record assignments without requiring an organizational Counselor role", async () => {
    await expect(getCurrentCoachCaseScope()).resolves.toEqual({
      caseIds: ["annie-john"],
      coupleContactCaseIds: ["annie-john"],
    });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "eq", args: ["assignment_type", "counselor"] });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "in", args: ["assigned_group_id", ["coach-team"]] });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "is", args: ["ended_at", null] });
  });

  it("lists only active Counselor teams supervised by the signed-in active Coach team", async () => {
    await expect(getCurrentCoachCounselors()).resolves.toEqual([
      { id: "counselor-a", name: "John & Stacy Wu", campus: "Oakland" },
      { id: "counselor-b", name: "Zed & Amy", campus: "Fremont" },
    ]);
    expect(mocks.filters).toContainEqual({ table: "supervision_assignments", method: "in", args: ["coach_group_id", ["coach-team"]] });
    expect(mocks.filters).toContainEqual({ table: "supervision_assignments", method: "is", args: ["ended_at", null] });
    expect(mocks.filters.some(({ table }) => table === "case_assignments")).toBe(false);
  });

  it("returns an empty Counselor panel when the active Coach team has no active supervisees", async () => {
    mocks.counselorAssignments = [];
    await expect(getCurrentCoachCounselors()).resolves.toEqual([]);
  });

});
