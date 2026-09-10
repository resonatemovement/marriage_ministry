import { describe, expect, it } from "vitest";

import { formatPhoneInput, isValidPhone, normalizePhone } from "./phone";

describe("onboarding phone input", () => {
  it("formats a US number and normalizes it for persistence", () => {
    expect(formatPhoneInput("5551234567")).toBe("(555) 123-4567");
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(isValidPhone("(555) 123-4567")).toBe(true);
  });

  it("rejects unrelated characters", () => {
    expect(formatPhoneInput("555abc1234")).toBe("(555) 123-4");
    expect(isValidPhone("abc")).toBe(false);
  });
});
