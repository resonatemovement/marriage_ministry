import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hasPartnerDetailsChanges, validatePartnerDetails, type PartnerDetailsFields } from "./partner-details-editor-model";

const valid: PartnerDetailsFields = { firstName: "Taylor", lastName: "Chen", phone: "(555) 555-1212", gender: "female" };
const editor = readFileSync("features/people/partner-details-editor.tsx", "utf8");

describe("partner details editor model", () => {
  it("reuses onboarding validation for names and phone", () => {
    expect(validatePartnerDetails(valid)).toEqual({});
    expect(validatePartnerDetails({ ...valid, firstName: "", phone: "555" })).toEqual({
      firstName: "First name is required.",
      phone: "Enter a valid phone number.",
    });
  });

  it("detects only valid, normalized field changes and preserves nullable legacy gender", () => {
    const original: PartnerDetailsFields = { firstName: "Taylor", lastName: "Chen", phone: "+15555551212", gender: "" };
    expect(hasPartnerDetailsChanges({ ...original, phone: "(555) 555-1212" }, original)).toBe(false);
    expect(hasPartnerDetailsChanges({ ...original, gender: "female" }, original)).toBe(true);
    expect(hasPartnerDetailsChanges({ ...original, firstName: "Jordan" }, original)).toBe(true);
  });

  it("renders the approved editable fields and keeps email read-only", () => {
    expect(editor).toContain("Edit Details");
    expect(editor).toContain(">First Name");
    expect(editor).toContain(">Last Name");
    expect(editor).toContain(">Phone");
    expect(editor).toContain("<label htmlFor={`partner-gender-${profileId}`}>Gender</label>");
    expect(editor).toContain("Email");
    expect(editor).toContain("readOnly aria-readonly=\"true\"");
    expect(editor).toContain("disabled={pending || !valid || !changed}");
    expect(editor).toContain("onBlur={() => setTouched");
    expect(editor).toContain("aria-describedby");
  });
});
