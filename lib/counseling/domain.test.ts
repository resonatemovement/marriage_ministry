import { describe, expect, it } from "vitest";

import {
  canManageAssignments,
  canActAsCoach,
  canTransitionCase,
  counselingStatusLabel,
  isAppRole,
  statusAfterAssignment,
} from "./domain";

describe("counseling case rules", () => {
  it.each([["matched", "Matched"], ["active", "In Progress"], ["pending_final", "Final Review"], ["finished", "Completed"], ["referred", "Referred"], ["inactive", "Inactive"]] as const)("presents %s as %s", (status, label) => {
    expect(counselingStatusLabel(status, true, true)).toBe(label);
  });

  it("presents an otherwise-ready unassigned couple as awaiting assignment", () => {
    expect(counselingStatusLabel(null, false, true)).toBe("Awaiting Counselor Assignment");
  });

  it("requires an active assignment to enter matched", () => {
    expect(canTransitionCase("interviewed", "matched", false)).toBe(false);
    expect(canTransitionCase("interviewed", "matched", true)).toBe(true);
  });

  it("moves only eligible intake statuses to matched on assignment", () => {
    expect(statusAfterAssignment("requested")).toBe("matched");
    expect(statusAfterAssignment("assessment")).toBe("matched");
    expect(statusAfterAssignment("interviewed")).toBe("matched");
    expect(statusAfterAssignment("active")).toBe("active");
    expect(statusAfterAssignment("finished")).toBe("finished");
  });
});

describe("assignment permissions", () => {
  it("allows only Admin and Super Admin roles", () => {
    expect(canManageAssignments(["admin"])).toBe(true);
    expect(canManageAssignments(["author", "super_admin"])).toBe(true);
    expect(canManageAssignments(["coach"])).toBe(false);
    expect(canManageAssignments(["counselor", "author"])).toBe(false);
  });

  it("recognizes only supported roles", () => {
    expect(isAppRole("super_admin")).toBe(true);
    expect(isAppRole("author")).toBe(true);
    expect(isAppRole("campus_lead")).toBe(true);
    expect(isAppRole("administrator")).toBe(false);
  });

  it("does not treat Campus Lead as a Coach role", () => {
    expect(canActAsCoach(["campus_lead"])).toBe(false);
    expect(canActAsCoach(["coach"])).toBe(true);
  });
});
