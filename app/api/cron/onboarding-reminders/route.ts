import { NextResponse } from "next/server";

import { processOnboardingReminderEmails } from "@/features/notifications/onboarding-reminders";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processOnboardingReminderEmails();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error("Onboarding reminder processing failed.");
    return NextResponse.json({ error: "Onboarding reminders could not be processed." }, { status: 500 });
  }
}
