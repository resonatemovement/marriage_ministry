import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reminder scheduling and lifecycle integration", () => {
  it("uses one Supabase Cron job with Vault-backed endpoint authorization and no Vercel reminder schedule", () => {
    const cron = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(cron.crons).not.toContainEqual({ path: "/api/cron/meeting-reminders", schedule: "0 * * * *" });
    expect(cron.crons).toContainEqual({ path: "/api/cron/keep-alive", schedule: "0 6 * * *" });
    const scheduler = readFileSync("supabase/migrations/20261016100000_schedule_meeting_reminders.sql", "utf8");
    expect(scheduler).toContain("create extension if not exists pg_cron");
    expect(scheduler).toContain("create extension if not exists pg_net");
    expect(scheduler).toContain("'meeting-reminders-hourly'");
    expect(scheduler).toContain("'0 * * * *'");
    expect(scheduler).toContain("net.http_get");
    expect(scheduler).toContain("vault.decrypted_secrets");
    expect(scheduler).toContain("meeting_reminder_endpoint_url");
    expect(scheduler).toContain("meeting_reminder_cron_secret");
    expect(scheduler).not.toContain("vercel.app");
    const route = readFileSync("app/api/cron/meeting-reminders/route.ts", "utf8");
    expect(route).toContain("authorization") ;
    expect(route).toContain("Bearer ${secret}");
    expect(route).toContain("processDueMeetingReminders");
    const service = readFileSync("features/notifications/homework-reminders.ts", "utf8");
    expect(service).toContain('from("case_session_meetings")');
    expect(service).toContain('from("homework_participant_progress")');
    expect(service).toContain("meeting.case_session_id");
    expect(service).toContain("deliverMeetingReminder");
  });

  it("uses Phase 3A delivery keys, attempt rows, Resend tags/webhooks, and reset cascades without a schedule table", () => {
    const delivery = readFileSync("features/notifications/meeting-notifications.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20261013100000_meeting_notifications.sql", "utf8");
    const reset = readFileSync("supabase/migrations/20261012160000_dev_reset_counseling_journey.sql", "utf8");
    const receiptReset = readFileSync("supabase/migrations/20261013101000_reset_meeting_notification_events.sql", "utf8");
    expect(delivery).toContain('event_type", kind');
    expect(delivery).toContain("resend_of_delivery_id: resendOfDeliveryId");
    expect(delivery).toContain("notificationId: delivery.id");
    expect(migration).toContain("unique index notification_deliveries_delivery_key_unique");
    expect(migration).toContain("notification_webhook_events");
    expect(reset).toContain("delete from public.notification_deliveries delivery");
    expect(receiptReset).toContain("on delete cascade");
    expect(reset).toContain("delete from public.case_session_meetings");
    expect(readFileSync("features/notifications/homework-reminders.ts", "utf8")).not.toContain("reminder_schedule");
  });

  it("keeps reminder history staff-only and links participants to their own Homework only", () => {
    const status = readFileSync("features/counseling-sessions/meeting-notification-status.tsx", "utf8");
    const route = readFileSync("app/workspace/homework/page.tsx", "utf8");
    const query = readFileSync("features/couple-workspace/queries.ts", "utf8");
    const workspace = readFileSync("features/couple-workspace/workspace.tsx", "utf8");
    expect(status).toContain("72-hour Homework reminder");
    expect(route).toContain('identity.roles.includes("couple")');
    expect(route).toContain('workspace="couple"');
    expect(query).toContain('.eq("profile_id", authenticatedProfileId)');
    expect(query).toContain('.eq("participant_progress_id", progress.id)');
    const homeworkPage = readFileSync("features/couple-workspace/homework-participant.tsx", "utf8");
    const actions = readFileSync("features/couple-workspace/homework-participant-actions.ts", "utf8");
    expect(workspace).toContain("?tab=homework");
    expect(workspace).toContain("Open Session Homework");
    expect(homeworkPage).toContain("Save Draft");
    expect(homeworkPage).toContain("Submit Homework");
    expect(homeworkPage).toContain("Submitted Homework is read-only.");
    expect(actions).toContain('rpc("persist_participant_homework"');
  });

  it("skips the 72-hour Homework lookup for a Session with no assignment revision while retaining the Meeting reminder path", () => {
    const service = readFileSync("features/notifications/homework-reminders.ts", "utf8");
    const delivery = readFileSync("features/notifications/meeting-notifications.ts", "utf8");
    expect(service).toContain(`if (!session.homework_assignment_revision_id) return { partners, active: session.status === "active", hasHomework: false`);
    expect(delivery).toContain("if (!session.homework_assignment_revision_id) return { hasHomework: false");
    expect(service).toContain('"meeting.reminder.24h"');
    expect(service).toContain('kind === "homework.reminder.72h" && (!meeting.case_session_id || !context.hasHomework)');
  });
});
