import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ resendMeetingNotification: vi.fn() }));

import { MeetingNotificationStatus, deliveryTime, resendableMeetingNotificationPartners } from "./meeting-notification-status";
import { formatCounselingMeetingDateTime } from "./meeting-date-time";

const source = readFileSync("features/counseling-sessions/meeting-notification-status.tsx", "utf8");
const coupleDetailSource = readFileSync("features/counseling-sessions/couple-detail-page.tsx", "utf8");
const dateTimeSource = readFileSync("features/counseling-sessions/meeting-date-time.ts", "utf8");
const actions = readFileSync("features/counseling-sessions/actions.ts", "utf8");
const partner = (id: string, firstName: string) => ({ id, firstName, name: `${firstName} Profile` });

function delivery(overrides: Partial<Parameters<typeof MeetingNotificationStatus>[0]["deliveries"][number]> & Pick<Parameters<typeof MeetingNotificationStatus>[0]["deliveries"][number], "id" | "recipient_profile_id" | "event_type" | "status" | "created_at" | "attempt_number">) {
  return { template_key: "meeting_email", recipient_email: "partner@example.test", error_category: null, error_message: null, ...overrides };
}

describe("MeetingNotificationStatus", () => {
  it("renders Meeting Invite timestamps with deterministic wording and timezone", () => {
    const timestamp = "2026-10-13T16:17:00.000Z";
    const fixedDelivery = delivery({ id: "fixed", recipient_profile_id: "partner-one", event_type: "meeting.scheduled", status: "sent", created_at: timestamp, attempt_number: 1 });
    expect(deliveryTime(fixedDelivery)).toBe("Oct 13 at 9:17 AM");
    expect(formatCounselingMeetingDateTime(timestamp)).toBe("Oct 13, 2026, 9:17 AM");

    const markup = renderToStaticMarkup(createElement(MeetingNotificationStatus, {
      partners: [partner("partner-one", "James")],
      deliveries: [fixedDelivery],
    }));
    expect(markup).toContain("Scheduled Oct 13 at 9:17 AM");
    expect(markup).not.toContain("Oct 13, 9:17 AM");
  });

  it("uses the same deterministic timestamp formatter for delivery history and case Meeting labels", () => {
    const attempt = delivery({ id: "history", recipient_profile_id: "partner-one", event_type: "meeting.rescheduled", status: "delivered", created_at: "2026-10-13T16:17:00.000Z", attempt_number: 2 });
    expect(deliveryTime(attempt)).toBe("Oct 13 at 9:17 AM");
    expect(source).toContain("deliveryTime(attempt)");
    expect(coupleDetailSource).toContain("formatCounselingMeetingDateTime(card.state.meeting.startsAt)");
    expect(coupleDetailSource).toContain("formatCounselingMeetingDateTime(meeting.startsAt)");
    expect(source).not.toContain("toLocaleString");
    expect(coupleDetailSource).not.toContain("toLocaleString");
    expect(coupleDetailSource).not.toContain("new Intl.DateTimeFormat");
    expect(dateTimeSource).toContain('COUNSELING_TIME_ZONE = "America/Los_Angeles"');
    expect(dateTimeSource).toContain("formatToParts(new Date(value))");
  });

  it("shows compact first-name rows with the latest state and a history affordance, without inline resend buttons", () => {
    const markup = renderToStaticMarkup(createElement(MeetingNotificationStatus, {
      partners: [partner("partner-one", "James"), partner("partner-two", "Gina")],
      deliveries: [
        delivery({ id: "scheduled", recipient_profile_id: "partner-one", event_type: "meeting.scheduled", status: "sent", created_at: "2026-10-10T10:00:00Z", attempt_number: 1 }),
        delivery({ id: "rescheduled", recipient_profile_id: "partner-one", event_type: "meeting.rescheduled", status: "delivered", created_at: "2026-10-11T10:00:00Z", attempt_number: 1 }),
        delivery({ id: "gina-scheduled", recipient_profile_id: "partner-two", event_type: "meeting.scheduled", status: "delivered", created_at: "2026-10-10T10:00:00Z", attempt_number: 1 }),
      ],
    }));
    expect(markup).toContain('aria-label="Meeting invites"');
    expect(markup).toContain(">James</span>");
    expect(markup).toContain(">Gina</span>");
    expect(markup).toContain("delivered");
    expect(markup).toContain("Rescheduled");
    expect(markup).toContain("View history");
    expect(markup).toContain('class="mt-6 border-t border-border pt-6" aria-label="Meeting invites"');
    expect(markup).toContain('class="mt-1 divide-y divide-border"');
    expect(markup).toContain('text-brand-secondary">Meeting invites</p>');
    expect(markup).not.toContain("Resend to this partner");
    expect(markup).not.toContain("<details");
  });

  it("keeps all event and attempt details in a shared Sheet without exposing provider identifiers", () => {
    expect(source).toContain("<Sheet open={Boolean(historyPartner)}");
    expect(source).toContain("history.map((attempt)");
    expect(source).toContain("Attempt {attempt.attempt_number}");
    expect(source).toContain("attempt.status");
    expect(source).toContain("deliveryTime(attempt)");
    expect(source).toContain("{attempt.error_message}");
    expect(source).toContain("history.some(isDevSink)");
    expect(source).toContain("DEV: Meeting invites are routed to Resend&apos;s test recipient.");
    const compactMarkup = renderToStaticMarkup(createElement(MeetingNotificationStatus, { partners: [partner("partner-one", "James")], deliveries: [] }));
    expect(compactMarkup).not.toContain("provider_id");
    expect(compactMarkup).not.toContain("webhook");
    expect(compactMarkup).not.toContain("recipient_email");
  });

  it("offers one current-meeting resend action per eligible partner using their newest relevant delivery", () => {
    expect(source).toContain("export function MeetingNotificationResendMenuItems");
    expect(source).toContain("resendableMeetingNotificationPartners(partners, deliveries)");
    expect(source).toContain('name="meetingId" value={meetingId}');
    expect(source).toContain('name="deliveryId" value={delivery.id}');
    expect(source).toContain('name="profileId" value={partner.id}');
    expect(source).toContain("const latest = latestPartnerDeliveries(partner.id, deliveries)[0]");
    expect(source).toContain("Resend meeting invite to {firstName}");
    expect(actions.slice(actions.indexOf("export async function resendMeetingNotification"), actions.indexOf("export async function resetCounselingJourney"))).toContain("revalidateCase(caseId)");
  });

  it("selects each eligible partner once using that partner’s latest attempt", () => {
    const partners = [partner("james", "James"), partner("gina", "Gina")];
    const eligible = resendableMeetingNotificationPartners(partners, [
      delivery({ id: "james-old", recipient_profile_id: "james", event_type: "meeting.scheduled", status: "sent", created_at: "2026-10-10T10:00:00Z", attempt_number: 1 }),
      delivery({ id: "james-new", recipient_profile_id: "james", event_type: "meeting.rescheduled", status: "delivered", created_at: "2026-10-11T10:00:00Z", attempt_number: 1 }),
      delivery({ id: "gina-blocked", recipient_profile_id: "gina", event_type: "meeting.scheduled", status: "bounced", created_at: "2026-10-11T10:00:00Z", attempt_number: 1 }),
    ]);
    expect(eligible.map(({ id, firstName }) => [id, firstName])).toEqual([["james", "James"]]);
  });
});
