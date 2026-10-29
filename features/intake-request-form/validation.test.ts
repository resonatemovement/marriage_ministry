import { describe, expect, it } from "vitest";

import { canAdvanceIntakeStep, capitalizeInitials, emptyDraft, getVisibleStepErrors, normalizeDraft, validateStep } from "./validation";

describe("public intake form validation", () => {
  it("requires both people and rejects duplicate email", () => {
    const draft = emptyDraft();
    draft.you.email = "same@example.com";
    draft.partner.email = "same@example.com";
    expect(validateStep(1, draft)["you.firstName"]).toBeTruthy();
    expect(validateStep(1, draft)["partner.email"]).toContain("different");
  });

  it("allows blank City values", () => {
    const draft = emptyDraft();
    draft.you = { firstName: "Cindy", lastName: "Lu", gender: "female", phone: "(510) 555-1212", email: "cindy@example.com", city: "", connections: [] };
    draft.partner = { firstName: "Alex", lastName: "Lu", gender: "male", phone: "(415) 555-1212", email: "alex@example.com", city: "", connections: [] };
    expect(validateStep(1, draft)["you.city"]).toBeUndefined();
    expect(validateStep(1, draft)["partner.city"]).toBeUndefined();
  });

  it("does not show errors before blur and clears a touched error when corrected", () => {
    const draft = emptyDraft();
    expect(getVisibleStepErrors(1, draft, {}, [])).toEqual({});
    expect(getVisibleStepErrors(1, draft, { "you.firstName": true }, [])).toMatchObject({ "you.firstName": "First name is required." });
    draft.you = { ...draft.you, firstName: "Cindy", lastName: "Lu", phone: "(510) 555-1212", email: "cindy.lu@mailinator.com" };
    draft.partner = { ...draft.partner, firstName: "Alex", lastName: "Lu", phone: "(415) 555-1212", email: "cindy.lu@mailinator.com" };
    expect(getVisibleStepErrors(1, draft, { "you.firstName": true }, [])).toEqual({});
  });

  it("shows duplicate email only for valid matching addresses after both blur", () => {
    const draft = emptyDraft();
    draft.you.email = "same";
    draft.partner.email = "same";
    const bothTouched = { "you.email": true, "partner.email": true };
    expect(getVisibleStepErrors(1, draft, bothTouched, [])["partner.email"]).toBe("Enter a valid email address.");
    draft.you.email = "same@example.com";
    draft.partner.email = "same@example.com";
    expect(getVisibleStepErrors(1, draft, { "you.email": true }, [])).not.toHaveProperty("partner.email");
    expect(getVisibleStepErrors(1, draft, bothTouched, [])).toMatchObject({ "partner.email": "Partner email must be different." });
    draft.partner.email = "alex.lu@mailinator.com";
    expect(getVisibleStepErrors(1, draft, bothTouched, [])).not.toHaveProperty("partner.email");
  });

  it("preserves touched feedback when navigating away and returning", () => {
    const draft = emptyDraft();
    const touched = { "you.firstName": true };
    expect(getVisibleStepErrors(1, draft, touched, [])).toHaveProperty("you.firstName");
    expect(getVisibleStepErrors(2, draft, touched, [])).toEqual({});
    expect(getVisibleStepErrors(1, draft, touched, [])).toHaveProperty("you.firstName");
  });

  it("requires Other campus and referral details", () => {
    const draft = emptyDraft();
    draft.you.connections = ["member"];
    draft.partner.connections = ["mc"];
    draft.referralSource = "other";
    expect(validateStep(3, draft).campus).toBeTruthy();
    expect(validateStep(4, draft).referralOther).toBeTruthy();
  });

  it("keeps Continue disabled until each required step is valid", () => {
    const draft = emptyDraft();
    const campuses = ["active-campus"];
    expect(canAdvanceIntakeStep(1, draft, campuses)).toBe(false);
    draft.you = { firstName: "Avery", lastName: "One", gender: "male", phone: "4155550101", email: "avery@example.com", city: "", connections: [] };
    draft.partner = { firstName: "Blair", lastName: "Two", gender: "", phone: "4155550102", email: "blair@example.com", city: "", connections: [] };
    expect(canAdvanceIntakeStep(1, draft, campuses)).toBe(false);
    draft.partner.gender = "female";
    expect(canAdvanceIntakeStep(1, draft, campuses)).toBe(true);

    expect(canAdvanceIntakeStep(2, draft, campuses)).toBe(false);
    draft.relationshipStatus = "married";
    expect(canAdvanceIntakeStep(2, draft, campuses)).toBe(true);
    draft.you.connections = ["member"];
    draft.partner.connections = ["mc"];
    draft.campusId = campuses[0]!;
    expect(canAdvanceIntakeStep(3, draft, campuses)).toBe(true);
    draft.workingWithCounselor = "no";
    draft.requestedSupport = ["lay_counselor"];
    draft.goals = "We want to communicate well.";
    draft.referralSource = "website";
    expect(canAdvanceIntakeStep(4, draft, campuses)).toBe(true);
    expect(canAdvanceIntakeStep(5, draft, campuses)).toBe(false);
  });

  it("preserves optional and conditional fields while validating them", () => {
    const draft = emptyDraft();
    draft.you = { firstName: "Avery", lastName: "One", gender: "male", phone: "4155550101", email: "avery@example.com", city: "", connections: ["member"] };
    draft.partner = { firstName: "Blair", lastName: "Two", gender: "female", phone: "4155550102", email: "blair@example.com", city: "", connections: ["mc"] };
    draft.relationshipStatus = "engaged";
    draft.campusOther = "Neighborhood church";
    draft.workingWithCounselor = "no";
    draft.requestedSupport = ["lay_counselor"];
    draft.goals = "We want to communicate well.";
    draft.referralSource = "other";
    expect(validateStep(3, draft, []).campus).toBeUndefined();
    expect(validateStep(4, draft).referralOther).toBeTruthy();
    expect(getVisibleStepErrors(4, draft, { referralSource: true }, []).referralOther).toBeUndefined();
    expect(getVisibleStepErrors(4, draft, { referralSource: true, referralOther: true }, []).referralOther).toBeTruthy();
    draft.referralOther = "A friend told us.";
    expect(validateStep(4, draft).referralOther).toBeUndefined();
    draft.questions = "x".repeat(10001);
    expect(validateStep(4, draft).questions).toBeTruthy();
    draft.questions = "";
    expect(validateStep(4, draft).questions).toBeUndefined();
  });

  it("normalizes emails and phones", () => {
    const draft = emptyDraft();
    draft.you.email = " A@EXAMPLE.COM ";
    draft.you.phone = "(415) 555-0101";
    expect(normalizeDraft(draft).you.email).toBe("a@example.com");
    expect(normalizeDraft(draft).you.phone).toBe("+14155550101");
  });

  it("rejects incomplete and duplicate normalized U.S. phones", () => {
    const draft = emptyDraft();
    draft.you = { ...draft.you, firstName: "A", lastName: "A", email: "a@example.com", phone: "(324) 234-3" };
    draft.partner = { ...draft.partner, firstName: "B", lastName: "B", email: "b@example.com", phone: "+1 510 555 1212" };
    expect(validateStep(1, draft)["you.phone"]).toBeTruthy();
    draft.you.phone = "5105551212";
    expect(validateStep(1, draft)["partner.phone"]).toContain("different");
    draft.partner.phone = "4155551212";
    expect(validateStep(1, draft)["partner.phone"]).toBeUndefined();
  });

  it("capitalizes initials without lowering intentional casing", () => {
    expect(capitalizeInitials("justin")).toBe("Justin");
    expect(capitalizeInitials("san jose")).toBe("San Jose");
    expect(capitalizeInitials("mary-jane o'connor")).toBe("Mary-Jane O'Connor");
    expect(capitalizeInitials("McDonald DeVito")).toBe("McDonald DeVito");
  });
});
