import { describe, expect, it } from "vitest";

import { activeTeamAssignmentCounts, assignedCoupleAssignmentType } from "./team-assignment";

describe("team Assigned Couples relationship", () => {
  it("uses Coach assignments for Coach Teams and preserves Counselor semantics for other teams", () => {
    expect(assignedCoupleAssignmentType("coaches")).toBe("coach");
    expect(assignedCoupleAssignmentType("counselors")).toBe("counselor");
    expect(assignedCoupleAssignmentType("campus_leads")).toBe("counselor");
    expect(assignedCoupleAssignmentType("couples")).toBeNull();
  });

  it("counts active Coach and Counselor assignments separately and excludes ended assignments", () => {
    const counts = activeTeamAssignmentCounts([
      { assigned_group_id: "coach-team", assignment_type: "coach", ended_at: null },
      { assigned_group_id: "coach-team", assignment_type: "counselor", ended_at: null },
      { assigned_group_id: "coach-team", assignment_type: "coach", ended_at: "2026-09-01" },
      { assigned_group_id: "counselor-team", assignment_type: "counselor", ended_at: null },
    ]);

    expect(counts.get("coach-team")).toEqual({ coach: 1, counselor: 1 });
    expect(counts.get("counselor-team")).toEqual({ counselor: 1 });
    expect(counts.get("unassigned-team")?.coach ?? 0).toBe(0);
  });
});
