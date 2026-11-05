import { describe, expect, it } from "vitest";

import { DEFAULT_INTAKE_ALERT_SETTINGS, parseIntakeAlertSettings } from "./intake-alert-settings-model";

function form(values: Record<string, string>) {
  const result = new FormData();
  Object.entries(values).forEach(([key, value]) => result.set(key, value));
  return result;
}

describe("Intake alert settings validation", () => {
  it("uses the approved elapsed-hour defaults", () => {
    expect(DEFAULT_INTAKE_ALERT_SETTINGS).toEqual({
      readyForReviewHours: 48,
      underReviewHours: 72,
      readyToInviteHours: 168,
      invitedOnboardingHours: 168,
    });
  });

  it("accepts positive whole-hour settings through the validated maximum", () => {
    expect(parseIntakeAlertSettings(form({ readyForReviewHours: "1", underReviewHours: "72", readyToInviteHours: "168", invitedOnboardingHours: "720" }))).toEqual({
      data: { readyForReviewHours: 1, underReviewHours: 72, readyToInviteHours: 168, invitedOnboardingHours: 720 },
      errors: null,
    });
  });

  it.each(["", "0", "-1", "1.5", "1e2", "721", "NaN"])("rejects invalid whole-hour value %s", (value) => {
    const result = parseIntakeAlertSettings(form({ readyForReviewHours: value, underReviewHours: "72", readyToInviteHours: "168", invitedOnboardingHours: "168" }));
    expect(result.data).toBeNull();
    expect(result.errors?.readyForReviewHours).toBeTruthy();
  });

  it("requires all four thresholds", () => {
    const result = parseIntakeAlertSettings(form({ readyForReviewHours: "48" }));
    expect(Object.keys(result.errors ?? {}).sort()).toEqual(["invitedOnboardingHours", "readyToInviteHours", "underReviewHours"]);
  });
});
