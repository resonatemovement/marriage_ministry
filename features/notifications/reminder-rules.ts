import type { EmailMessage } from "./types";

export type ReminderKind = "homework.reminder.72h" | "meeting.reminder.24h";
export type HomeworkState = "not_started" | "in_progress" | "submitted" | "reviewed" | null;

export type ReminderMeeting = {
  id: string;
  startsAt: string;
  updatedAt: string;
  completedAt: string | null;
  caseActive: boolean;
  sessionActive: boolean;
  hasHomework: boolean;
};

function reminderDueAt(meeting: ReminderMeeting, kind: ReminderKind) {
  return Date.parse(meeting.startsAt) - (kind === "homework.reminder.72h" ? 72 : 24) * 60 * 60 * 1000;
}

export function reminderIsDue(meeting: ReminderMeeting, kind: ReminderKind, now: number) {
  const target = reminderDueAt(meeting, kind);
  return meeting.caseActive && meeting.sessionActive && !meeting.completedAt && Number.isFinite(target)
    && now >= target && now < Date.parse(meeting.startsAt) && Date.parse(meeting.updatedAt) <= target;
}

export function shouldSendReminder(meeting: ReminderMeeting, kind: ReminderKind, homeworkStatus: HomeworkState, now: number) {
  if (!reminderIsDue(meeting, kind, now)) return false;
  if (kind === "homework.reminder.72h") return meeting.hasHomework && homeworkStatus !== "submitted" && homeworkStatus !== "reviewed";
  return true;
}

export function reminderDeliveryKey(meetingId: string, startsAt: string, kind: ReminderKind, profileId: string) {
  return `${meetingId}:${kind}:${startsAt}:${profileId}`;
}

export function renderReminderEmail(input: {
  kind: ReminderKind;
  firstName: string;
  to: string;
  sessionTitle: string;
  startsAt: string;
  homeworkStatus: HomeworkState;
  hasHomework: boolean;
  appUrl: string;
  notificationId: string;
}): EmailMessage {
  const meetingTime = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" }).format(new Date(input.startsAt));
  const homeworkIncomplete = input.hasHomework && input.homeworkStatus !== "submitted" && input.homeworkStatus !== "reviewed";
  const isHomeworkReminder = input.kind === "homework.reminder.72h";
  const cta = isHomeworkReminder ? "Continue Homework" : homeworkIncomplete ? "Complete Homework" : input.hasHomework ? "View Session" : "View Meeting Details";
  const target = isHomeworkReminder || (input.kind === "meeting.reminder.24h" && homeworkIncomplete) ? `${input.appUrl}/workspace/homework` : `${input.appUrl}/workspace`;
  const subject = isHomeworkReminder ? `Reminder: Homework for ${input.sessionTitle}` : `Meeting reminder: ${input.sessionTitle}`;
  const body = isHomeworkReminder
    ? `Your Homework for ${input.sessionTitle} remains available to continue. Your upcoming Meeting is ${meetingTime}.`
    : homeworkIncomplete
      ? `Your Meeting for ${input.sessionTitle} is coming up on ${meetingTime}. Your Homework is still available to complete.`
      : `Your Meeting for ${input.sessionTitle} is coming up on ${meetingTime}.`;
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return {
    to: input.to,
    subject,
    text: `Hi ${input.firstName},\n\n${body}\n\n${cta}: ${target}\n\nResonate Marriage Ministry`,
    html: `<p>Hi ${escape(input.firstName)},</p><p>${escape(body)}</p><p><a href="${escape(target)}">${cta}</a></p><p>Resonate Marriage Ministry</p>`,
    tags: [{ name: "notification_id", value: input.notificationId }],
  };
}
