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
  counselorDetail: { id: "counselor-a", name: "John & Stacy Wu", group_type: "counselor_team", active: true, group_members: [{ ended_at: null, profile: { id: "member-a", first_name: "John", last_name: "Wu", email: "private@example.test" } }, { ended_at: null, profile: { id: "member-b", first_name: "Stacy", last_name: "Wu" } }] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "coach-member" } }, error: null }) },
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      let selected = "";
      query.select = (columns: string) => { selected = columns; mocks.filters.push({ table, method: "select", args: [columns] }); return query; };
      for (const method of ["select", "eq", "is", "in"]) {
        if (method === "select") continue;
        query[method] = (...args: unknown[]) => {
          mocks.filters.push({ table, method, args });
          return query;
        };
      }
      const result = () => {
        if (table === "groups") return selected.startsWith("id,group_members") ? mocks.coachTeams : mocks.counselorDetail;
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

import { getCurrentCoachCaseScope, getCurrentCoachCounselorDetail, getCurrentCoachCounselors } from "./workspace-queries";

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

  it("returns only supervised team identity and member names, not Couple records or contact fields", async () => {
    await expect(getCurrentCoachCounselorDetail("counselor-a")).resolves.toEqual({
      id: "counselor-a", name: "John & Stacy Wu", campus: "Oakland", members: [
        { id: "member-a", name: "John Wu" }, { id: "member-b", name: "Stacy Wu" },
      ],
    });
    const detailSelect = mocks.filters.find(({ table, method, args }) => table === "groups" && method === "select" && String(args[0]).includes("group_members(ended_at"));
    expect(detailSelect?.args[0]).not.toContain("email");
    expect(detailSelect?.args[0]).not.toContain("counseling_cases");
    expect(detailSelect?.args[0]).not.toContain("case_assignments");
  });

  it("does not resolve a Counselor detail outside the signed-in Coach team's active supervision", async () => {
    mocks.counselorAssignments = [];
    await expect(getCurrentCoachCounselorDetail("not-supervised")).resolves.toBeNull();
    expect(mocks.filters.some(({ table, method, args }) => table === "groups" && method === "select" && String(args[0]).includes("group_members(ended_at"))).toBe(false);
  });
});
