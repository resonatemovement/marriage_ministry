import { describe, expect, it } from "vitest";

import { capitalizeInitials, emptyDraft, normalizeDraft, revalidateVisibleErrors, validateStep } from "./validation";

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
    draft.you = { firstName: "Cindy", lastName: "Lu", phone: "(510) 555-1212", email: "cindy@example.com", city: "", connections: [] };
    draft.partner = { firstName: "Alex", lastName: "Lu", phone: "(415) 555-1212", email: "alex@example.com", city: "", connections: [] };
    expect(validateStep(1, draft)["you.city"]).toBeUndefined();
    expect(validateStep(1, draft)["partner.city"]).toBeUndefined();
  });

  it("clears only visible errors once values become valid, including duplicate email", () => {
    const draft = emptyDraft();
    const errors = validateStep(1, draft);
    draft.you = { ...draft.you, firstName: "Cindy", lastName: "Lu", phone: "(510) 555-1212", email: "cindy.lu@mailinator.com" };
    draft.partner = { ...draft.partner, firstName: "Alex", lastName: "Lu", phone: "(415) 555-1212", email: "cindy.lu@mailinator.com" };
    const duplicateErrors = { ...errors, "partner.email": "Partner email must be different." };
    expect(revalidateVisibleErrors(1, draft, duplicateErrors)["you.lastName"]).toBeUndefined();
    expect(revalidateVisibleErrors(1, draft, duplicateErrors)["you.phone"]).toBeUndefined();
    expect(revalidateVisibleErrors(1, draft, duplicateErrors)["you.email"]).toBeUndefined();
    draft.partner.email = "alex.lu@mailinator.com";
    expect(revalidateVisibleErrors(1, draft, duplicateErrors)["partner.email"]).toBeUndefined();
  });

  it("requires Other campus and referral details", () => {
    const draft = emptyDraft();
    draft.you.connections = ["member"];
    draft.partner.connections = ["mc"];
    draft.referralSource = "other";
    expect(validateStep(3, draft).campus).toBeTruthy();
    expect(validateStep(4, draft).referralOther).toBeTruthy();
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
