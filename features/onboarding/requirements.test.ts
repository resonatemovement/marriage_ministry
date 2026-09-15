import { describe, expect, it } from "vitest";

import { getOnboardingRequirements } from "./requirements";

const complete = { firstName: "Avery", lastName: "Rivera", email: "avery@example.com", campusId: "campus", phone: "+14155550101", photoPath: "profiles/user/avatar.avif" };

describe("getOnboardingRequirements", () => {
  it("recognizes a complete profile", () => expect(getOnboardingRequirements(complete)).toEqual({ complete: true, missing: [] }));
  it("reports every missing requirement", () => expect(getOnboardingRequirements({ ...complete, firstName: "", lastName: " ", email: null, campusId: null, phone: "bad", photoPath: null })).toEqual({ complete: false, missing: ["first name", "last name", "email", "campus", "phone", "profile photo"] }));
  it("requires a valid phone even when present", () => expect(getOnboardingRequirements({ ...complete, phone: "" }).missing).toContain("phone"));
  it("accepts legacy WebP and new AVIF photo paths", () => {
    expect(getOnboardingRequirements({ ...complete, photoPath: "profiles/user/avatar.webp" }).complete).toBe(true);
    expect(getOnboardingRequirements({ ...complete, photoPath: "profiles/user/avatar.avif" }).complete).toBe(true);
  });
});
