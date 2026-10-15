import { NextResponse } from "next/server";
import { Resend } from "resend";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

const TRACKED_EVENTS = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.failed", "email.bounced", "email.complained", "email.suppressed"]);

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    const payload = await request.text();
    const headers = {
      id: request.headers.get("svix-id") ?? "",
      timestamp: request.headers.get("svix-timestamp") ?? "",
      signature: request.headers.get("svix-signature") ?? "",
    };
    event = new Resend().webhooks.verify({ payload, headers, webhookSecret: secret });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }
  if (!TRACKED_EVENTS.has(event.type)) return NextResponse.json({ received: true });
  if (!("tags" in event.data) || !event.data.tags?.notification_id) return NextResponse.json({ received: true });
  const notificationId = event.data.tags.notification_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) return NextResponse.json({ received: true });
  const providerEventId = request.headers.get("svix-id");
  if (!providerEventId) return NextResponse.json({ error: "Missing webhook event ID." }, { status: 400 });
  const failureMessage = "failed" in event.data ? event.data.failed.reason : "bounce" in event.data ? event.data.bounce.message : "suppressed" in event.data ? event.data.suppressed.message : null;
  const client = createServiceRoleSupabaseClient();
  const { error } = await client.rpc("record_meeting_notification_webhook", {
    target_provider_event_id: providerEventId,
    target_event_type: event.type,
    target_provider_message_id: "email_id" in event.data ? event.data.email_id : "",
    target_occurred_at: event.created_at,
    target_failure_message: failureMessage?.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]").slice(0, 500) ?? undefined,
    target_delivery_id: notificationId,
  });
  if (error) {
    console.error("Resend meeting webhook event could not be recorded.", error.message);
    return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
