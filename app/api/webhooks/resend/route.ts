import { NextResponse } from "next/server";
import { Resend } from "resend";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

const TRACKED_EVENTS = new Set(["email.sent", "email.delivered", "email.delivery_delayed", "email.failed", "email.bounced", "email.complained", "email.suppressed"]);

function eventTag(tags: unknown, name: string) {
  if (Array.isArray(tags)) {
    const tag = tags.find((item) => item && typeof item === "object" && "name" in item && item.name === name);
    return tag && typeof tag === "object" && "value" in tag && typeof tag.value === "string" ? tag.value : null;
  }
  if (tags && typeof tags === "object" && name in tags) {
    const value = (tags as Record<string, unknown>)[name];
    return typeof value === "string" ? value : null;
  }
  return null;
}

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
  if (!("tags" in event.data)) return NextResponse.json({ received: true });
  const notificationId = eventTag(event.data.tags, "notification_id");
  if (!notificationId) return NextResponse.json({ received: true });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) return NextResponse.json({ received: true });
  const providerEventId = request.headers.get("svix-id");
  if (!providerEventId) return NextResponse.json({ error: "Missing webhook event ID." }, { status: 400 });
  const failureMessage = "failed" in event.data ? event.data.failed.reason : "bounce" in event.data ? event.data.bounce.message : "suppressed" in event.data ? event.data.suppressed.message : null;
  const client = createServiceRoleSupabaseClient();
  if (eventTag(event.data.tags, "notification_type") === "homework_completion") {
    const attemptId = eventTag(event.data.tags, "notification_attempt_id");
    const deliveryId = eventTag(event.data.tags, "notification_delivery_id");
    if (!attemptId || !deliveryId
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryId)) return NextResponse.json({ received: true });
    const recipients = "to" in event.data && Array.isArray(event.data.to) ? event.data.to : [];
    const providerMessageId = "email_id" in event.data ? event.data.email_id : "";
    if (recipients.length !== 1 || typeof recipients[0] !== "string" || !providerMessageId) return NextResponse.json({ received: true });
    const outcome = event.type === "email.sent" ? "accepted"
      : event.type === "email.delivered" ? "delivered"
        : event.type === "email.failed" ? "rejected_permanent"
          : event.type === "email.bounced" ? "bounced" : null;
    if (!outcome) return NextResponse.json({ received: true });
    const rpc = client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
    const verification = await rpc.rpc("verify_homework_completion_notification_webhook", {
      target_notification_id: notificationId,
      target_attempt_id: attemptId,
      target_delivery_id: deliveryId,
      target_provider_message_id: providerMessageId,
      target_provider_recipients: recipients,
    });
    if (verification.error) {
      console.error("Resend Homework notification webhook correlation failed.", { code: "homework_webhook_correlation_failed" });
      return NextResponse.json({ error: "Webhook could not be verified." }, { status: 500 });
    }
    if (verification.data !== "verified") return NextResponse.json({ received: true });
    const { error } = await rpc.rpc("reconcile_homework_completion_notification_attempt", {
      target_attempt_id: attemptId,
      provider_outcome: outcome,
      target_provider_message_id: providerMessageId,
      target_provider_event_id: providerEventId,
      target_error_category: failureMessage ? "resend_delivery_failed" : undefined,
    });
    if (error) {
      console.error("Resend Homework notification webhook event could not be recorded.", { code: "homework_reconcile_failed" });
      return NextResponse.json({ error: "Webhook event could not be recorded." }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }
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
