import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ filters: [] as { table: string; method: string; args: unknown[] }[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "coach-member" } }, error: null }) },
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in"]) {
        query[method] = (...args: unknown[]) => {
          mocks.filters.push({ table, method, args });
          return query;
        };
      }
      query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const data = table === "groups"
          ? [{ id: "coach-team" }]
          : [
              { counseling_case_id: "john-stacy", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
              { counseling_case_id: "annie-john", assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: null },
            ];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return query;
    },
  }),
}));

import { getCurrentCoachCaseScope } from "./workspace-queries";

describe("current Coach counseling scope query", () => {
  beforeEach(() => { mocks.filters.length = 0; });

  it("queries active Counselor-of-record assignments without requiring an organizational Counselor role", async () => {
    await expect(getCurrentCoachCaseScope()).resolves.toEqual({
      caseIds: ["annie-john"],
      coupleContactCaseIds: ["annie-john"],
    });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "eq", args: ["assignment_type", "counselor"] });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "in", args: ["assigned_group_id", ["coach-team"]] });
    expect(mocks.filters).toContainEqual({ table: "case_assignments", method: "is", args: ["ended_at", null] });
  });
});
