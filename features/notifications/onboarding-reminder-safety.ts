import "server-only";

import type { EmailMessage, EmailProvider, ProviderSendResult } from "./types";

const DEV_SUPABASE_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const DEV_VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";

export type OnboardingReminderSafetyEnvironment = {
  safetyMode: string | undefined;
  vercel: string | undefined;
  vercelEnv: string | undefined;
  vercelProjectId: string | undefined;
  vercelGitCommitRef: string | undefined;
  supabaseUrl: string | undefined;
};

export type OnboardingReminderRecipientDecision =
  | { allowed: true }
  | { allowed: false; reason: "safety_disabled" | "environment_unverified" | "recipient_not_allowed" };

function isVerifiedDevRuntime(environment: OnboardingReminderSafetyEnvironment) {
  if (environment.safetyMode !== "true"
    || environment.vercel !== "1"
    || environment.vercelEnv !== "production"
    || environment.vercelProjectId !== DEV_VERCEL_PROJECT_ID
    || environment.vercelGitCommitRef !== "main") return false;

  try {
    const supabaseUrl = new URL(environment.supabaseUrl ?? "");
    return supabaseUrl.origin === `https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`
      && supabaseUrl.pathname === "/"
      && !supabaseUrl.search
      && !supabaseUrl.hash;
  } catch {
    return false;
  }
}

function isMailinatorAddress(email: string) {
  if (email.length > 254 || email !== email.trim()) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || at !== email.indexOf("@")) return false;
  const localPart = email.slice(0, at);
  const domain = email.slice(at + 1);
  return localPart.length <= 64
    && /^[a-z0-9._+-]+$/i.test(localPart)
    && !localPart.startsWith(".")
    && !localPart.endsWith(".")
    && !localPart.includes("..")
    && domain.toLowerCase() === "mailinator.com";
}

export function validateOnboardingReminderRecipient(
  recipientEmail: string,
  environment: OnboardingReminderSafetyEnvironment = onboardingReminderSafetyEnvironment(),
): OnboardingReminderRecipientDecision {
  if (environment.safetyMode !== "true") return { allowed: false, reason: "safety_disabled" };
  if (!isVerifiedDevRuntime(environment)) return { allowed: false, reason: "environment_unverified" };
  if (!isMailinatorAddress(recipientEmail)) return { allowed: false, reason: "recipient_not_allowed" };
  return { allowed: true };
}

function onboardingReminderSafetyEnvironment(): OnboardingReminderSafetyEnvironment {
  return {
    safetyMode: process.env.ONBOARDING_REMINDER_DEV_SAFETY_MODE,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectId: process.env.VERCEL_PROJECT_ID,
    vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

export function createOnboardingReminderEmailProvider(
  provider: EmailProvider,
  environment: OnboardingReminderSafetyEnvironment = onboardingReminderSafetyEnvironment(),
): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<ProviderSendResult> {
      const decision = validateOnboardingReminderRecipient(message.to, environment);
      if (!decision.allowed) {
        return decision.reason === "recipient_not_allowed"
          ? { success: false, errorCategory: "invalid_recipient", errorMessage: "Onboarding reminder recipient is not allowed." }
          : { success: false, errorCategory: "configuration", errorMessage: "Onboarding reminder email safety is not enabled for the verified DEV environment." };
      }
      return provider.send(message);
    },
  };
}
