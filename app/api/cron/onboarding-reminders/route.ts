import { NextResponse } from "next/server";

import { processOnboardingReminderEmails } from "@/features/notifications/onboarding-reminders";
import { onboardingReminderFailureDetails } from "@/features/notifications/onboarding-reminder-errors";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function handle(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processOnboardingReminderEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Onboarding reminder processing failed.", {
      ...onboardingReminderFailureDetails(error),
      timestamp: new Date().toISOString(),
      runId: crypto.randomUUID(),
    });
    return NextResponse.json({ error: "Onboarding reminders could not be processed." }, { status: 500 });
  }
}

// Vercel Cron calls configured paths with GET and supplies CRON_SECRET as a
// Bearer token. Keep POST for the existing protected verification workflow.
export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
