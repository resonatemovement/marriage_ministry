import { describe, expect, it } from "vitest";
import { canManuallyTransitionIntakeRequest, coupleDisplayName, INTAKE_STATUS_LABEL, manualNextIntakeStatuses } from "./model";

describe("Intake Request status model", () => {
  it("labels and limits manual status transitions", () => { expect(INTAKE_STATUS_LABEL.ready_to_invite).toBe("Ready to Invite"); expect(manualNextIntakeStatuses("under_review")).toEqual(["ready_for_review", "ready_to_invite", "closed"]); expect(canManuallyTransitionIntakeRequest("under_review", "invited")).toBe(false); expect(canManuallyTransitionIntakeRequest("invited", "closed")).toBe(false); });
  it("formats a couple from the two prospective people", () => { expect(coupleDisplayName([{ personPosition: "partner", firstName: "Stacy", lastName: "Miller" }, { personPosition: "requester", firstName: "John", lastName: "Smith" }])).toBe("John Smith & Stacy Miller"); });
});
