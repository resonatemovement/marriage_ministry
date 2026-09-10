import { describe, expect, it } from "vitest";
import { CONNECTION_LABEL, coupleDisplayName, formatIntakeDate, formatIntakePhone, intakeLabels, INTAKE_STATUS_LABEL, isDeleteConfirmation, isIntakeDeleteEligible, notProvided, REFERRAL_LABEL, SUPPORT_LABEL, yesNo } from "./model";
import { intakeRequestActions } from "./action-model";

describe("Intake Request status model", () => {
  it("keeps the legacy label while exposing only explicit actions", () => { expect(INTAKE_STATUS_LABEL.ready_to_invite).toBe("Ready to Invite"); expect(intakeRequestActions("ready_for_review")).toEqual(["start_review", "close"]); expect(intakeRequestActions("under_review")).toEqual(["send_invite", "close"]); expect(intakeRequestActions("invited")).toEqual([]); });
  it("formats a couple from the two prospective people", () => { expect(coupleDisplayName([{ personPosition: "partner", firstName: "Stacy", lastName: "Miller" }, { personPosition: "requester", firstName: "John", lastName: "Smith" }])).toBe("John Smith & Stacy Miller"); });
  it("formats submitted intake values for human review", () => {
    expect(intakeLabels(["member", "regular_attendee"], CONNECTION_LABEL)).toBe("Resonate Member, Regular Resonate Church Attendee (3+ times a month)");
    expect(intakeLabels(["lay_counselor", "professional_referral"], SUPPORT_LABEL)).toBe("Resonate Marriage Lay Counselor, Professional therapist referral");
    expect(REFERRAL_LABEL.ministry_leader).toBe("Referral from a ministry leader");
    expect(formatIntakePhone("+14155550101")).toBe("(415) 555-0101");
    expect(formatIntakeDate("2026-09-09")).toBe("Sep 9, 2026");
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
    expect(notProvided("San Francisco")).toBe("San Francisco");
    expect(notProvided("Oakland")).toBe("Oakland");
    expect(notProvided("Build healthier communication\nwith care.")).toContain("\n");
    expect(notProvided("What should we expect?")).toBe("What should we expect?");
    expect(notProvided("Heard about the program at a workshop")).toBe("Heard about the program at a workshop");
  });
  it("uses Not provided for blank or invalid optional values", () => {
    expect(notProvided(" ")).toBe("Not provided");
    expect(formatIntakePhone("")).toBe("Not provided");
    expect(formatIntakeDate(null)).toBe("Not provided");
    expect(intakeLabels([], CONNECTION_LABEL)).toBe("Not provided");
  });
  it("requires the exact uppercase destructive confirmation", () => {
    expect(isDeleteConfirmation("DELETE")).toBe(true);
    expect(isDeleteConfirmation("delete")).toBe(false);
    expect(isDeleteConfirmation("Delete")).toBe(false);
    expect(isDeleteConfirmation("DELETE ")).toBe(false);
  });
  it("allows only unlinked non-invited requests to be deleted", () => {
    expect(isIntakeDeleteEligible("ready_for_review", null)).toBe(true);
    expect(isIntakeDeleteEligible("under_review", null)).toBe(true);
    expect(isIntakeDeleteEligible("closed", null)).toBe(true);
    expect(isIntakeDeleteEligible("invited", null)).toBe(false);
    expect(isIntakeDeleteEligible("under_review", "group-id")).toBe(false);
  });
});
