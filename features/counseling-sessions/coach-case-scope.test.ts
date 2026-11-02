import { describe, expect, it } from "vitest";

import { coachCaseScope } from "./coach-case-scope";

describe("Coach workspace Case scope", () => {
  it("includes only active Counselor-of-record assignments to the signed-in user's active Coach team", () => {
    expect(coachCaseScope([
      // A separate Coach assignment does not make a Case a counseling Case.
      { counseling_case_id: "john-stacy", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
      { counseling_case_id: "john-stacy", assigned_group_id: "other-counselor-team", assignment_type: "counselor", ended_at: null },
      // A Coach team may be Counselor-of-record without holding the org Counselor role.
      { counseling_case_id: "annie-john", assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: null },
      { counseling_case_id: "other-team", assigned_group_id: "another-team", assignment_type: "coach", ended_at: null },
      { counseling_case_id: "ended", assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: "2026-10-01T00:00:00Z" },
      { counseling_case_id: "unrelated-type", assigned_group_id: "coach-team", assignment_type: "campus_lead", ended_at: null },
    ], ["coach-team"])).toEqual({
      caseIds: ["annie-john"],
      coupleContactCaseIds: ["annie-john"],
    });
  });

  it("keeps Coach + Super Admin in the same Counselor-of-record scope as Coach-only", () => {
    expect(coachCaseScope([
      { counseling_case_id: "john-stacy", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
      { counseling_case_id: "annie-john", assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: null },
      { counseling_case_id: "admin-visible-only", assigned_group_id: "unrelated-team", assignment_type: "counselor", ended_at: null },
    ], ["coach-team"]).caseIds).toEqual(["annie-john"]);
  });

  it("returns an empty scope when no active Coach team is available", () => {
    expect(coachCaseScope([
      { counseling_case_id: "case", assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
    ], [])).toEqual({ caseIds: [], coupleContactCaseIds: [] });
  });
});
