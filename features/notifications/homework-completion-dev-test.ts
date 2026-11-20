import "server-only";

import { timingSafeEqual } from "node:crypto";
import { parseOnboardingReminderAllowedRecipients } from "./onboarding-reminder-safety";

const DEV_SUPABASE_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const DEV_VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";
const DEV_TEST_BRANCH = "feature/homework-completion-notification";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HomeworkCompletionDevTestEnvironment = {
  enabled?: string;
  vercel?: string;
  vercelEnv?: string;
  vercelProjectId?: string;
  gitCommitRef?: string;
  supabaseUrl?: string;
  notificationId?: string;
  caseSessionId?: string;
  coupleGroupId?: string;
  allowedRecipients?: string;
};

export type HomeworkCompletionDevTestConfig = {
  notificationId: string;
  caseSessionId: string;
  coupleGroupId: string;
  allowedRecipients: [string, string];
};

export function parseHomeworkCompletionDevTestConfig(
  environment: HomeworkCompletionDevTestEnvironment,
): HomeworkCompletionDevTestConfig | null {
  if (environment.enabled !== "true"
    || environment.vercel !== "1"
    || environment.vercelEnv !== "preview"
    || environment.vercelProjectId !== DEV_VERCEL_PROJECT_ID
    || environment.gitCommitRef !== DEV_TEST_BRANCH
    || !environment.notificationId || !UUID.test(environment.notificationId)
    || !environment.caseSessionId || !UUID.test(environment.caseSessionId)
    || !environment.coupleGroupId || !UUID.test(environment.coupleGroupId)) return null;

  try {
    const supabaseUrl = new URL(environment.supabaseUrl ?? "");
    if (supabaseUrl.origin !== `https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`
      || supabaseUrl.pathname !== "/" || supabaseUrl.search || supabaseUrl.hash) return null;
  } catch {
    return null;
  }

  const recipients = parseOnboardingReminderAllowedRecipients(environment.allowedRecipients);
  if (recipients.length !== 2 || environment.allowedRecipients?.split(",").length !== 2) return null;
  return {
    notificationId: environment.notificationId,
    caseSessionId: environment.caseSessionId,
    coupleGroupId: environment.coupleGroupId,
    allowedRecipients: recipients as [string, string],
  };
}

export function getHomeworkCompletionDevTestConfig() {
  return parseHomeworkCompletionDevTestConfig({
    enabled: process.env.HOMEWORK_NOTIFICATION_DEV_TEST_MODE,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectId: process.env.VERCEL_PROJECT_ID,
    gitCommitRef: process.env.VERCEL_GIT_COMMIT_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    notificationId: process.env.HOMEWORK_NOTIFICATION_DEV_TEST_NOTIFICATION_ID,
    caseSessionId: process.env.HOMEWORK_NOTIFICATION_DEV_TEST_CASE_SESSION_ID,
    coupleGroupId: process.env.HOMEWORK_NOTIFICATION_DEV_TEST_COUPLE_GROUP_ID,
    allowedRecipients: process.env.HOMEWORK_NOTIFICATION_DEV_TEST_ALLOWED_RECIPIENTS,
  });
}

export function isHomeworkCompletionDevTestAuthorized(request: Request, secret = process.env.HOMEWORK_NOTIFICATION_DEV_TEST_SECRET) {
  if (!secret || secret.length < 32) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([\x21-\x7e]{32,})$/.exec(authorization);
  if (!match) return false;
  const supplied = Buffer.from(match[1]!, "utf8");
  const expected = Buffer.from(secret, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const homeworkCompletionDevTestInternals = { DEV_TEST_BRANCH, DEV_VERCEL_PROJECT_ID, DEV_SUPABASE_PROJECT_REF };
