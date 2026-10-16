import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("features/onboarding/profile-edit.tsx", "utf8");

describe("My Profile save feedback", () => {
  it("shows success only after the server confirms the profile update", () => {
    expect(component).toContain('showSuccessToast("Profile updated successfully.")');
    expect(component).toContain('showErrorToast("Unable to update profile. Please try again.")');
    expect(component.indexOf('showErrorToast("Unable to update profile. Please try again.")'))
      .toBeLessThan(component.indexOf('showSuccessToast("Profile updated successfully.")'));
    expect(component).not.toContain('role="status" className="text-sm text-text-muted">{"Profile saved."}');
  });

  it("preserves field-level validation, entered values, photo feedback, and pending state", () => {
    expect(component).toContain("validateOnboarding({");
    expect(component).toContain('role="alert"');
    expect(component).toContain("defaultValue={firstName}");
    expect(component).toContain("defaultValue={lastName}");
    expect(component).toContain("defaultValue={formatPhoneInput(phone)}");
    expect(component).toContain('onSaved={() => setPhotoMessage("Profile photo saved.")}');
    expect(component).toContain("disabled={pending}");
    expect(component).toContain('pending ? "Saving..."');
  });
});
