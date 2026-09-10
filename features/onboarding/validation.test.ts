import { describe, expect, it } from "vitest";

import { validateOnboarding } from "./validation";

describe("onboarding validation", () => {
  it("requires trimmed first and last names and a phone number", () => {
    expect(validateOnboarding({ firstName: " ", lastName: "", phone: "" })).toEqual({
      firstName: "First name is required.",
      lastName: "Last name is required.",
      phone: "Phone number is required.",
    });
  });

  it("accepts a practical phone format and rejects clearly invalid values", () => {
    expect(validateOnboarding({ firstName: "Jordan", lastName: "Smith", phone: "+1 (555) 123-4567" })).toEqual({});
    expect(validateOnboarding({ firstName: "Jordan", lastName: "Smith", phone: "test@test" })).toEqual({ phone: "Enter a valid phone number." });
  });
});
