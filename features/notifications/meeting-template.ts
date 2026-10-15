import type { EmailMessage } from "./types";

import { meetingIcsContent } from "./meeting-calendar";

type MeetingEmailContext = {
  id: string;
  firstName: string;
  to: string;
  title: string;
  type: "initial" | "authored" | "followup";
  startsAt: string;
  endsAt: string;
  appUrl: string;
  googleUrl: string;
  rescheduled: boolean;
  notificationId: string;
};

const html = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function renderMeetingEmail(context: MeetingEmailContext): EmailMessage {
  const meetingTitle = context.type === "initial" ? "Initial Meeting" : context.type === "followup" ? `${context.title} follow-up Meeting` : context.title;
  const cta = context.type === "initial" ? "View Meeting Details" : context.type === "followup" ? "View Current Session" : "View Session";
  const when = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" }).format(new Date(context.startsAt));
  const scheduleText = context.rescheduled ? `has been updated. Its new date and time are ${when}.` : `is scheduled for ${when}.`;
  const materialText = context.type === "authored" ? "Session Material and Homework are available in your workspace.\n\n" : "";
  const target = context.type === "initial" ? context.appUrl : `${context.appUrl}#current-session`;
  const event = { id: context.id, title: context.type === "initial" ? "Resonate Marriage Ministry — Initial Meeting" : `Resonate Marriage Ministry — ${context.title}`, startsAt: context.startsAt, endsAt: context.endsAt, appUrl: context.appUrl };
  const text = `Hi ${context.firstName},\n\nYour ${meetingTitle} ${scheduleText}\n\n${materialText}${cta}: ${target}\nAdd to Google Calendar: ${context.googleUrl}\n\nResonate Marriage Ministry`;
  const htmlBody = `<p>Hi ${html(context.firstName)},</p><p>Your <strong>${html(meetingTitle)}</strong> ${html(scheduleText)}</p>${materialText ? `<p>${html(materialText.trim())}</p>` : ""}<p><a href="${html(target)}">${cta}</a></p><p><a href="${html(context.googleUrl)}">Add to Google Calendar</a></p><p>Resonate Marriage Ministry</p>`;
  return {
    to: context.to,
    subject: `${context.rescheduled ? "Updated meeting" : "Meeting scheduled"}: ${meetingTitle}`,
    text,
    html: htmlBody,
    tags: [{ name: "notification_id", value: context.notificationId }],
    attachments: [{ filename: "resonate-meeting.ics", content: meetingIcsContent(event), contentType: "text/calendar; charset=utf-8" }],
  };
}
