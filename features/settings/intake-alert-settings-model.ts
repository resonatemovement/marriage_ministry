export const INTAKE_ALERT_HOURS_MIN = 1;
export const INTAKE_ALERT_HOURS_MAX = 720;

export const DEFAULT_INTAKE_ALERT_SETTINGS = {
  readyForReviewHours: 48,
  underReviewHours: 72,
  readyToInviteHours: 168,
  invitedOnboardingHours: 168,
} as const;

export interface IntakeAlertSettings {
  readyForReviewHours: number;
  underReviewHours: number;
  readyToInviteHours: number;
  invitedOnboardingHours: number;
}
export type IntakeAlertSettingsErrors = Partial<Record<keyof IntakeAlertSettings, string>>;

const fields = [
  ["readyForReviewHours", "Ready for Review"],
  ["underReviewHours", "Under Review"],
  ["readyToInviteHours", "Ready to Invite"],
  ["invitedOnboardingHours", "Invited with incomplete onboarding"],
] as const;

export function parseIntakeAlertSettings(formData: FormData):
  | { data: IntakeAlertSettings; errors: null }
  | { data: null; errors: IntakeAlertSettingsErrors } {
  const data = {} as Record<keyof IntakeAlertSettings, number>;
  const errors: IntakeAlertSettingsErrors = {};

  for (const [field, label] of fields) {
    const raw = formData.get(field);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!/^\d+$/.test(value)) {
      errors[field] = `${label} must be a positive whole number of hours.`;
      continue;
    }
    const parsed = Number(value);
    if (parsed < INTAKE_ALERT_HOURS_MIN || parsed > INTAKE_ALERT_HOURS_MAX) {
      errors[field] = `${label} must be between ${INTAKE_ALERT_HOURS_MIN} and ${INTAKE_ALERT_HOURS_MAX} hours.`;
      continue;
    }
    data[field] = parsed;
  }

  if (Object.keys(errors).length) return { data: null, errors };
  return { data: data as IntakeAlertSettings, errors: null };
}
