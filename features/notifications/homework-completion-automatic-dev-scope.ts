import "server-only";

import { parseOnboardingReminderAllowedRecipients } from "./onboarding-reminder-safety";

const DEV_SUPABASE_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const DEV_VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";
const APPROVED_COUPLE_GROUP_ID = "23f1ac05-7090-4081-bf42-78f92a8da5d1";

export type HomeworkCompletionAutomaticDevEnvironment = {
  vercel?: string;
  vercelEnv?: string;
  vercelProjectId?: string;
  supabaseUrl?: string;
  firstCounselorEmail?: string;
  secondCounselorEmail?: string;
};

export type HomeworkCompletionAutomaticDevScope = {
  coupleGroupId: typeof APPROVED_COUPLE_GROUP_ID;
  allowedRecipients: [string, string];
};

export function parseHomeworkCompletionAutomaticDevScope(
  environment: HomeworkCompletionAutomaticDevEnvironment,
): HomeworkCompletionAutomaticDevScope | null {
  if (environment.vercel !== "1"
    || environment.vercelEnv !== "production"
    || environment.vercelProjectId !== DEV_VERCEL_PROJECT_ID
    || !environment.firstCounselorEmail
    || !environment.secondCounselorEmail) return null;

  try {
    const url = new URL(environment.supabaseUrl ?? "");
    if (url.origin !== `https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`
      || url.pathname !== "/" || url.search || url.hash) return null;
  } catch {
    return null;
  }

  const recipients = parseOnboardingReminderAllowedRecipients(
    `${environment.firstCounselorEmail},${environment.secondCounselorEmail}`,
  );
  if (recipients.length !== 2 || recipients[0] === recipients[1]) return null;

  return { coupleGroupId: APPROVED_COUPLE_GROUP_ID, allowedRecipients: recipients as [string, string] };
}

export function getHomeworkCompletionAutomaticDevScope() {
  return parseHomeworkCompletionAutomaticDevScope({
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectId: process.env.VERCEL_PROJECT_ID,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    firstCounselorEmail: process.env.TEST_COUNSELOR_EMAIL,
    secondCounselorEmail: process.env.TEST_COUNSELOR_2_EMAIL,
  });
}

export const homeworkCompletionAutomaticDevScopeInternals = {
  APPROVED_COUPLE_GROUP_ID,
  DEV_SUPABASE_PROJECT_REF,
  DEV_VERCEL_PROJECT_ID,
};
