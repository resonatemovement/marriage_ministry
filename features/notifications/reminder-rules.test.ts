import { describe, expect, it } from "vitest";

import { reminderDeliveryKey, reminderIsDue, renderReminderEmail, shouldSendReminder, type ReminderMeeting } from "./reminder-rules";

const startsAt = "2026-11-20T18:00:00.000Z";
const meeting: ReminderMeeting = { id: "meeting-1", startsAt, updatedAt: "2026-11-01T00:00:00.000Z", completedAt: null, caseActive: true, sessionActive: true, hasHomework: true };
const due72 = Date.parse(startsAt) - 72 * 60 * 60 * 1000;
const due24 = Date.parse(startsAt) - 24 * 60 * 60 * 1000;

describe("meeting reminder rules", () => {
  it("sends 72-hour homework only for an active incomplete partner and skips no-homework assignments", () => {
    expect(shouldSendReminder(meeting, "homework.reminder.72h", "not_started", due72)).toBe(true);
    expect(shouldSendReminder(meeting, "homework.reminder.72h", "in_progress", due72)).toBe(true);
    expect(shouldSendReminder(meeting, "homework.reminder.72h", "submitted", due72)).toBe(false);
    expect(shouldSendReminder(meeting, "homework.reminder.72h", "reviewed", due72)).toBe(false);
    expect(shouldSendReminder({ ...meeting, hasHomework: false }, "homework.reminder.72h", null, due72)).toBe(false);
    expect(shouldSendReminder(meeting, "homework.reminder.72h", null, due72)).toBe(true);
  });

  it("sends 24-hour reminder independently of Homework and content can adapt per partner", () => {
    expect(shouldSendReminder(meeting, "meeting.reminder.24h", "not_started", due24)).toBe(true);
    expect(["not_started", "in_progress", "submitted", "reviewed"].every((status) => shouldSendReminder(meeting, "meeting.reminder.24h", status as "not_started" | "in_progress" | "submitted" | "reviewed", due24))).toBe(true);
    expect(shouldSendReminder({ ...meeting, hasHomework: false }, "meeting.reminder.24h", null, due24)).toBe(true);
    const common = { firstName: "Alex", to: "alex@example.test", sessionTitle: "Session 2", startsAt, hasHomework: true, appUrl: "https://resonate.example", notificationId: "delivery-1" };
    const incomplete = renderReminderEmail({ ...common, kind: "meeting.reminder.24h", homeworkStatus: "in_progress" });
    const complete = renderReminderEmail({ ...common, kind: "meeting.reminder.24h", homeworkStatus: "submitted" });
    expect(incomplete.text).toContain("Complete Homework");
    expect(incomplete.text).toContain("still available to complete");
    expect(incomplete.text).toContain("/workspace/homework");
    expect(complete.text).toContain("View Session");
    expect(complete.text).not.toContain("Homework is still available");
  });

  it("uses a Meeting-only message for Session 0/no Homework and excludes private case information", () => {
    const message = renderReminderEmail({ kind: "meeting.reminder.24h", firstName: "Alex", to: "a@example.test", sessionTitle: "Initial Meeting", startsAt, homeworkStatus: null, hasHomework: false, appUrl: "https://resonate.example", notificationId: "delivery-2" });
    expect(message.subject).toContain("Initial Meeting");
    expect(message.text).toContain("View Meeting Details");
    expect(message.text).not.toContain("Homework");
    expect(message.text).not.toContain("partner");
    expect(message.text).not.toContain("counseling");
  });

  it("follows the current schedule, suppresses late catch-up and terminal meetings, and deduplicates by reminder anchor", () => {
    expect(reminderIsDue(meeting, "homework.reminder.72h", due72)).toBe(true);
    expect(reminderIsDue({ ...meeting, startsAt: "2026-11-21T18:00:00.000Z" }, "homework.reminder.72h", due72)).toBe(false);
    expect(reminderIsDue({ ...meeting, updatedAt: new Date(due72 + 1).toISOString() }, "homework.reminder.72h", due72)).toBe(false);
    expect(reminderIsDue({ ...meeting, updatedAt: new Date(due24 + 1).toISOString() }, "meeting.reminder.24h", due24)).toBe(false);
    expect(reminderIsDue({ ...meeting, completedAt: new Date(due72 - 1).toISOString() }, "homework.reminder.72h", due72)).toBe(false);
    expect(reminderIsDue({ ...meeting, caseActive: false }, "meeting.reminder.24h", due24)).toBe(false);
    expect(reminderIsDue({ ...meeting, sessionActive: false }, "meeting.reminder.24h", due24)).toBe(false);
    expect(reminderIsDue(meeting, "meeting.reminder.24h", Date.parse(startsAt))).toBe(false);
    expect(reminderDeliveryKey(meeting.id, startsAt, "meeting.reminder.24h", "partner-1")).not.toBe(reminderDeliveryKey(meeting.id, "2026-11-21T18:00:00.000Z", "meeting.reminder.24h", "partner-1"));
  });
});
