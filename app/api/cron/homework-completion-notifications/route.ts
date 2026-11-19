import { NextResponse } from "next/server";

import { processHomeworkCompletionNotifications } from "@/features/notifications/homework-completion-delivery";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...await processHomeworkCompletionNotifications() });
  } catch {
    console.error("Homework completion notification worker failed.");
    return NextResponse.json({ error: "Homework notifications could not be processed." }, { status: 500 });
  }
}
