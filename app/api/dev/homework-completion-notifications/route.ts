import { NextResponse } from "next/server";

import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { processHomeworkCompletionDevTestNotification } from "@/features/notifications/homework-completion-delivery";
import {
  getHomeworkCompletionDevTestConfig,
  isHomeworkCompletionDevTestAuthorized,
} from "@/features/notifications/homework-completion-dev-test";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getHomeworkCompletionDevTestConfig();
  if (!config) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const identity = await getAuthenticatedIdentity().catch(() => null);
  if (!identity || identity.accountStage !== "active") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!identity.roles.some((role) => role === "admin" || role === "super_admin")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  if (!isHomeworkCompletionDevTestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1
    || !("notificationId" in body)
    || body.notificationId !== config.notificationId) {
    return NextResponse.json({ error: "Request does not match the configured DEV test notification." }, { status: 400 });
  }

  try {
    const result = await processHomeworkCompletionDevTestNotification(config);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error("DEV Homework notification test could not be processed.");
    return NextResponse.json({ error: "DEV test notification could not be processed." }, { status: 409 });
  }
}
