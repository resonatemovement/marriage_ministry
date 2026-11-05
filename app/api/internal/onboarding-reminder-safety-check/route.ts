import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { validateOnboardingReminderRecipient } from "@/features/notifications/onboarding-reminder-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidCronSecret(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const environment = {
    safetyMode: process.env.ONBOARDING_REMINDER_DEV_SAFETY_MODE,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelProjectId: process.env.VERCEL_PROJECT_ID,
    vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
  const mailinator = "synthetic.safety-check@mailinator.com";
  const allowed = validateOnboardingReminderRecipient(mailinator, environment).allowed;
  const runtimeIdentityVerified = validateOnboardingReminderRecipient(mailinator, {
    ...environment,
    safetyMode: "true",
  }).allowed;

  return NextResponse.json({
    authenticated: true,
    safetyModeEnabled: environment.safetyMode === "true",
    runtimeIdentityVerified,
    mailinatorAllowed: allowed,
    nonMailinatorDenied: !validateOnboardingReminderRecipient("synthetic.safety-check@example.invalid", environment).allowed,
    malformedDenied: !validateOnboardingReminderRecipient("not-an-email", environment).allowed,
    missingSafetyConfigDenied: !validateOnboardingReminderRecipient(mailinator, {
      ...environment,
      safetyMode: undefined,
    }).allowed,
    mismatchedVercelProjectDenied: !validateOnboardingReminderRecipient(mailinator, {
      ...environment,
      vercelProjectId: "prj_intentionally_mismatched",
    }).allowed,
    mismatchedSupabaseProjectDenied: !validateOnboardingReminderRecipient(mailinator, {
      ...environment,
      supabaseUrl: "https://intentionally-mismatched.supabase.co",
    }).allowed,
  });
}
