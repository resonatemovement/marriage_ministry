import { describe, expect, it } from "vitest";

import { coachCaseScope } from "./coach-case-scope";

describe("Coach workspace Case scope", () => {
  it("includes only active assignments to the signed-in user's active Coach team", () => {
    expect(coachCaseScope([
      { counseling_case_id: "own-coach-assignment", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
      { counseling_case_id: "own-care-assignment", assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: null },
      { counseling_case_id: "other-team", assigned_group_id: "another-team", assignment_type: "coach", ended_at: null },
      { counseling_case_id: "ended", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: "2026-10-01T00:00:00Z" },
      { counseling_case_id: "unrelated-type", assigned_group_id: "coach-team", assignment_type: "campus_lead", ended_at: null },
    ], ["coach-team"])).toEqual({
      caseIds: ["own-coach-assignment", "own-care-assignment"],
      coupleContactCaseIds: ["own-care-assignment"],
    });
  });

  it("does not broaden Coach scope based on other account roles", () => {
    expect(coachCaseScope([
      { counseling_case_id: "assigned", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
      { counseling_case_id: "admin-visible-only", assigned_group_id: "unrelated-team", assignment_type: "coach", ended_at: null },
    ], ["coach-team"]).caseIds).toEqual(["assigned"]);
  });

  it("returns an empty scope when no active Coach team is available", () => {
    expect(coachCaseScope([
      { counseling_case_id: "case", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
    ], [])).toEqual({ caseIds: [], coupleContactCaseIds: [] });
  });
});
