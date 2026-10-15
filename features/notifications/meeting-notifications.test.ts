import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Resend } from "resend";

import { googleCalendarUrl, meetingIcsContent } from "./meeting-calendar";
import { renderMeetingEmail } from "./meeting-template";
import { attemptIndependently } from "./meeting-delivery";

const calendarEvent = {
  id: "meeting-123",
  title: "Resonate Marriage Ministry — Session 2: Communication",
  startsAt: "2026-10-20T18:00:00.000Z",
  endsAt: "2026-10-20T19:00:00.000Z",
  appUrl: "https://resonate.example/workspace",
};

describe("meeting notifications and calendar", () => {
  it("creates Google and ICS events from the current meeting with only safe details", () => {
    const google = new URL(googleCalendarUrl(calendarEvent));
    const ics = meetingIcsContent(calendarEvent);
    expect(google.hostname).toBe("calendar.google.com");
    expect(google.searchParams.get("dates")).toBe("20261020T180000Z/20261020T190000Z");
    expect(google.searchParams.get("details")).toContain(calendarEvent.appUrl);
    expect(ics).toContain("UID:meeting-123@resonatemovement.org");
    expect(ics).toContain("DTSTART:20261020T180000Z");
    expect(ics).toContain("SUMMARY:Resonate Marriage Ministry — Session 2: Communication");
    expect(ics).toContain(calendarEvent.appUrl);
    expect(ics).not.toContain("Homework answer");
    expect(ics).not.toContain("Prepare & Enrich");
    expect(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  });

  it("uses meeting-specific content and attaches fresh calendar details for Initial, authored, follow-up and reschedule email", () => {
    const common = { ...calendarEvent, firstName: "Avery", to: "avery@example.test", googleUrl: googleCalendarUrl(calendarEvent), notificationId: "delivery-1" };
    const initial = renderMeetingEmail({ ...common, type: "initial", title: "unused", rescheduled: false });
    const authored = renderMeetingEmail({ ...common, type: "authored", title: "Session 2: Communication", rescheduled: false });
    const followup = renderMeetingEmail({ ...common, type: "followup", title: "Session 2: Communication", rescheduled: false });
    const updated = renderMeetingEmail({ ...common, type: "authored", title: "Session 2: Communication", rescheduled: true });
    expect(initial.text).toContain("Initial Meeting");
    expect(initial.text).toContain("View Meeting Details");
    expect(authored.text).toContain("Session Material and Homework are available");
    expect(authored.text).toContain("View Session");
    expect(followup.text).toContain("View Current Session");
    expect(followup.text).not.toContain("Session Material and Homework are available");
    expect(updated.text).toContain("has been updated");
    expect(updated.attachments?.[0].content).toContain("DTSTART:20261020T180000Z");
    expect(updated.tags).toEqual([{ name: "notification_id", value: "delivery-1" }]);
    expect(updated.text).not.toContain("counseling notes");
  });

  it("records one partner per delivery attempt and deduplicates scheduled event keys", () => {
    const migration = readFileSync("supabase/migrations/20261013100000_meeting_notifications.sql", "utf8");
    const dispatcher = readFileSync("features/notifications/meeting-notifications.ts", "utf8");
    expect(migration).toContain("attempt_number integer not null");
    expect(migration).toContain("resend_of_delivery_id uuid");
    expect(migration).toContain("unique index notification_deliveries_delivery_key_unique");
    expect(migration).toContain("provider_event_id text primary key");
    expect(readFileSync("features/notifications/reminder-rules.ts", "utf8")).toContain("${meetingId}:${kind}:${startsAt}:${profileId}");
    expect(dispatcher).toContain("attemptIndependently(context.partners");
  });

  it("attempts both partner messages when one delivery fails", async () => {
    const attempted: string[] = [];
    const results = await attemptIndependently(["partner-a", "partner-b"], async (partner) => {
      attempted.push(partner);
      if (partner === "partner-a") throw new Error("provider unavailable");
    });
    expect(attempted).toEqual(["partner-a", "partner-b"]);
    expect(results.map(({ status }) => status)).toEqual(["rejected", "fulfilled"]);
  });

  it("verifies raw Resend webhooks and delegates duplicate protection to the event receipt RPC", () => {
    const route = readFileSync("app/api/webhooks/resend/route.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20261013100000_meeting_notifications.sql", "utf8");
    expect(route).toContain("await request.text()");
    expect(route).toContain("webhooks.verify");
    expect(route).toContain("svix-signature");
    expect(route).toContain("record_meeting_notification_webhook");
    expect(route).toContain("target_delivery_id: notificationId");
    expect(migration).toContain("on conflict (provider_event_id) do nothing");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    const webhookMigration = readFileSync("supabase/migrations/20261013103000_record_webhook_failure_reason.sql", "utf8");
    for (const status of ["email.delivered", "email.delivery_delayed", "email.failed", "email.bounced", "email.complained"]) expect(webhookMigration).toContain(`when '${status}'`);
    expect(webhookMigration).toContain("target_failure_message");
    expect(readFileSync("supabase/migrations/20261013104000_match_webhook_delivery_tag.sql", "utf8")).toContain("provider_message_id is null or provider_message_id = target_provider_message_id");
  });

  it("rejects a Resend webhook with an invalid signature", () => {
    const resend = new Resend("re_test_key");
    expect(() => resend.webhooks.verify({
      payload: JSON.stringify({ type: "email.delivered", created_at: "2026-10-13T18:00:00Z", data: { email_id: "email-1", tags: { notification_id: "00000000-0000-4000-8000-000000000000" } } }),
      headers: { id: "msg_test", timestamp: "1791914400", signature: "v1,invalid" },
      webhookSecret: "whsec_dGVzdC1zZWNyZXQ=",
    })).toThrow();
  });

  it("keeps manual resend individual and preserves reset cleanup through cascading event receipts", () => {
    const action = readFileSync("features/counseling-sessions/actions.ts", "utf8");
    const dispatcher = readFileSync("features/notifications/meeting-notifications.ts", "utf8");
    const reset = readFileSync("supabase/migrations/20261012160000_dev_reset_counseling_journey.sql", "utf8");
    const cleanup = readFileSync("supabase/migrations/20261013101000_reset_meeting_notification_events.sql", "utf8");
    expect(action).toContain("await requireOneOfRoles([...CARE_ROLES, \"admin\", \"super_admin\"] as const");
    expect(action).toContain("resendMeetingEmail(meetingId, profileId, deliveryId)");
    expect(dispatcher).toContain("recipient_profile_id: profileId");
    expect(dispatcher).toContain("resend_of_delivery_id: resendOfDeliveryId");
    expect(reset).toContain("delete from public.notification_deliveries delivery");
    expect(cleanup).toContain("on delete cascade");
    expect(readFileSync("supabase/migrations/20261013102000_allow_missing_notification_email.sql", "utf8")).toContain("alter column recipient_email drop not null");
  });
});
