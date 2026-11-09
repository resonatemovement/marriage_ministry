export type OnboardingReminderFailureStage =
  | "configuration"
  | "supabase"
  | "eligibility"
  | "delivery_tracking"
  | "unexpected";

export class OnboardingReminderProcessingError extends Error {
  constructor(
    readonly stage: Exclude<OnboardingReminderFailureStage, "unexpected">,
    readonly errorCode: string,
  ) {
    super("Onboarding reminder processing failed.");
    this.name = "OnboardingReminderProcessingError";
  }
}

export function safeOnboardingReminderErrorCode(error: unknown, fallback: string) {
  if (!error || typeof error !== "object" || !("code" in error)) return fallback;
  const code = error.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : fallback;
}

export function onboardingReminderFailureDetails(error: unknown) {
  if (error instanceof OnboardingReminderProcessingError) {
    return { stage: error.stage, errorCode: error.errorCode };
  }
  return { stage: "unexpected" as const, errorCode: "unexpected_application_error" };
}
