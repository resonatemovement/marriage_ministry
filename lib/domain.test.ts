import { describe, expect, it } from "vitest";

import {
  canManageAssignments,
  canTransitionCase,
  isAppRole,
  statusAfterAssignment,
} from "./domain";

describe("counseling case rules", () => {
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
    expect(isAppRole("administrator")).toBe(false);
  });
});
