import { NextResponse } from "next/server";

import { processDueMeetingReminders } from "@/features/notifications/homework-reminders";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processDueMeetingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Meeting reminder cron failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Meeting reminders could not be processed." }, { status: 500 });
  }
}
