import "server-only";

import { Resend } from "resend";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { createResendEmailProvider } from "./provider";
import { googleCalendarUrl } from "./meeting-calendar";
import { renderMeetingEmail } from "./meeting-template";
import { attemptIndependently } from "./meeting-delivery";
import { renderReminderEmail, type HomeworkState, type ReminderKind } from "./reminder-rules";
import { resolveEmailRecipient } from "./dev-email-routing";

type EventKind = "meeting.scheduled" | "meeting.rescheduled" | ReminderKind;
type MeetingType = "initial" | "authored" | "followup";
type MeetingRow = { id: string; counseling_case_id: string; case_session_id: string | null; session_id: string | null; starts_at: string; ends_at: string; completed_at: string | null; session: { title: string } | null };
type PartnerRow = { id: string; first_name: string; email: string | null };

function serviceClient() {
  return createServiceRoleSupabaseClient();
}

function appUrl() {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("APP_URL is not configured.");
  return new URL(configured).origin;
}

function statusMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Meeting email delivery failed.").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]").slice(0, 500);
}

async function suppressesAddress(email: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { suppressed: false, error: "Resend is not configured." };
  const result = await new Resend(key).suppressions.get(email);
  if (result.data) return { suppressed: true, error: null };
  if (result.error && (result.error as { statusCode?: number }).statusCode !== 404) {
    return { suppressed: false, error: statusMessage(result.error) };
  }
  return { suppressed: false, error: null };
}

async function meetingContext(meetingId: string) {
  const client = serviceClient();
  const { data, error } = await client.from("case_session_meetings").select("id,counseling_case_id,case_session_id,session_id,starts_at,ends_at,completed_at,session:sessions(title)").eq("id", meetingId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Scheduled Meeting is unavailable.");
  const raw = data as unknown as MeetingRow;
  const title = raw.session_id && raw.session?.title ? raw.session.title : "Initial Meeting";
  const caseRow = await client.from("counseling_cases").select("couple_group_id").eq("id", raw.counseling_case_id).maybeSingle();
  if (caseRow.error || !caseRow.data) throw new Error(caseRow.error?.message ?? "Counseling case is unavailable.");
  const memberResult = await client.from("group_members").select("profile_id,profile:profiles(id,first_name,email)").eq("group_id", caseRow.data.couple_group_id).is("ended_at", null);
  if (memberResult.error) throw new Error(memberResult.error.message);
  const partners = (memberResult.data ?? []).flatMap((item) => {
    const profile = item.profile as unknown as PartnerRow | null;
    return profile ? [profile] : [];
  });
  if (partners.length !== 2) throw new Error("Both Couple partner profiles are unavailable.");
  let isFollowup = false;
  if (raw.case_session_id) {
    const { count, error: countError } = await client.from("case_session_meetings").select("id", { count: "exact", head: true }).eq("case_session_id", raw.case_session_id);
    if (countError) throw new Error(countError.message);
    isFollowup = (count ?? 0) > 1;
  }
  const base = appUrl();
  const meetingType: MeetingType = raw.session_id === null ? "initial" : isFollowup ? "followup" : "authored";
  const event = { id: raw.id, title: raw.session_id === null ? "Resonate Marriage Ministry — Initial Meeting" : `Resonate Marriage Ministry — ${title}`, startsAt: raw.starts_at, endsAt: raw.ends_at, appUrl: new URL("/workspace", base).toString() };
  return { client, raw, meetingType, title, partners, appUrl: event.appUrl, googleUrl: googleCalendarUrl(event) };
}

async function deliverOne(meetingId: string, profileId: string, kind: EventKind, deliveryKey: string | null, resendOfDeliveryId: string | null, reminder?: { homeworkStatus: HomeworkState; hasHomework: boolean; sessionTitle: string }) {
  const context = await meetingContext(meetingId);
  const partner = context.partners.find(({ id }) => id === profileId);
  if (!partner) throw new Error("The selected recipient is not part of this Couple.");
  const { client } = context;
  const email = partner.email?.trim().toLowerCase() || null;
  const deliveryRecipient = email ? resolveEmailRecipient(email, { nodeEnv: process.env.NODE_ENV, testMode: process.env.DEV_EMAIL_TEST_MODE, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }) : null;
  const previous = await client.from("notification_deliveries").select("attempt_number").eq("meeting_id", meetingId).eq("recipient_profile_id", profileId).eq("event_type", kind).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const attemptNumber = (previous.data?.attempt_number ?? 0) + 1;
  const { data: delivery, error: insertError } = await client.from("notification_deliveries").insert({
    event_type: kind,
    related_entity_type: "case_session_meeting",
    related_entity_id: meetingId,
    template_key: `${kind === "homework.reminder.72h" ? "homework_reminder_72h_email" : kind === "meeting.reminder.24h" ? "meeting_reminder_24h_email" : "meeting_scheduled_email"}${deliveryRecipient?.isTestSink ? "_dev_sink" : ""}`,
    channel: "email",
    recipient_profile_id: profileId,
    recipient_email: email,
    status: email ? "pending" : "no_email",
    counseling_case_id: context.raw.counseling_case_id,
    meeting_id: meetingId,
    attempt_number: attemptNumber,
    resend_of_delivery_id: resendOfDeliveryId,
    delivery_key: deliveryKey,
    ...(!email ? { error_category: "missing_email", error_message: "Partner profile has no email address." } : {}),
  }).select("id").maybeSingle();
  if (insertError?.code === "23505" && deliveryKey) return { status: "duplicate", errorMessage: null };
  if (insertError || !delivery) throw new Error(insertError?.message ?? "Unable to record meeting notification.");
  if (!email) return { status: "no_email", errorMessage: "Partner profile has no email address." };

  const suppression = await suppressesAddress(deliveryRecipient!.email);
  if (suppression.suppressed || suppression.error) {
    await client.from("notification_deliveries").update({ status: suppression.suppressed ? "suppressed" : "failed", error_category: suppression.suppressed ? "suppressed" : "suppression_check", error_message: suppression.suppressed ? "Resend suppression list blocks this address." : suppression.error, ...(suppression.suppressed ? { suppressed_at: new Date().toISOString() } : { failed_at: new Date().toISOString() }) }).eq("id", delivery.id).eq("status", "pending");
    return { status: suppression.suppressed ? "suppressed" : "failed", errorMessage: suppression.suppressed ? "Resend suppression list blocks this address." : suppression.error };
  }

  const message = reminder
    ? renderReminderEmail({ kind: kind as ReminderKind, firstName: partner.first_name, to: deliveryRecipient!.email, sessionTitle: reminder.sessionTitle, startsAt: context.raw.starts_at, homeworkStatus: reminder.homeworkStatus, hasHomework: reminder.hasHomework, appUrl: new URL(context.appUrl).origin, notificationId: delivery.id })
    : renderMeetingEmail({ id: context.raw.id, firstName: partner.first_name, to: deliveryRecipient!.email, title: context.title, type: context.meetingType, startsAt: context.raw.starts_at, endsAt: context.raw.ends_at, appUrl: context.appUrl, googleUrl: context.googleUrl, rescheduled: kind === "meeting.rescheduled", notificationId: delivery.id });
  const result = await createResendEmailProvider().send(message);
  if (result.success) {
    await client.from("notification_deliveries").update({ status: "sent", provider_message_id: result.providerMessageId, sent_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "pending");
    return { status: "sent", errorMessage: null };
  } else {
    await client.from("notification_deliveries").update({ status: "failed", error_category: result.errorCategory, error_message: result.errorMessage.slice(0, 500), failed_at: new Date().toISOString() }).eq("id", delivery.id).eq("status", "pending");
    return { status: "failed", errorMessage: result.errorMessage };
  }
}

export async function dispatchMeetingNotifications(meetingId: string, kind: EventKind) {
  try {
    const context = await meetingContext(meetingId);
    if (context.raw.completed_at) return;
    const results = await attemptIndependently(context.partners, (partner) => deliverOne(meetingId, partner.id, kind, `${meetingId}:${kind}:${context.raw.starts_at}:${partner.id}`, null).then(() => undefined));
    results.filter((result) => result.status === "rejected").forEach((result) => console.error("Meeting partner notification failed.", result.reason));
  } catch (error) {
    console.error("Meeting notification dispatch failed after scheduling.", error);
  }
}

export async function resendMeetingNotification(meetingId: string, recipientProfileId: string, previousDeliveryId: string) {
  try {
    const client = serviceClient();
    const { data: previous } = await client.from("notification_deliveries").select("event_type").eq("id", previousDeliveryId).eq("meeting_id", meetingId).eq("recipient_profile_id", recipientProfileId).maybeSingle();
    if (!previous) throw new Error("Notification attempt is unavailable.");
    if (previous.event_type === "homework.reminder.72h" || previous.event_type === "meeting.reminder.24h") {
      const context = await currentReminderState(meetingId, recipientProfileId);
      if (previous.event_type === "homework.reminder.72h" && (!context.hasHomework || context.homeworkStatus === "submitted" || context.homeworkStatus === "reviewed")) throw new Error("Homework is already complete or unavailable.");
      const result = await deliverOne(meetingId, recipientProfileId, previous.event_type, null, previousDeliveryId, { homeworkStatus: context.homeworkStatus, hasHomework: context.hasHomework, sessionTitle: context.sessionTitle });
      return { success: true as const, deliveryStatus: result.status, deliveryError: result.errorMessage };
    }
    const kind: EventKind = previous.event_type === "meeting.rescheduled" ? "meeting.rescheduled" : "meeting.scheduled";
    const result = await deliverOne(meetingId, recipientProfileId, kind, null, previousDeliveryId);
    return { success: true as const, deliveryStatus: result.status, deliveryError: result.errorMessage };
  } catch (error) {
    return { error: statusMessage(error) } as const;
  }
}

async function currentReminderState(meetingId: string, profileId: string) {
  const context = await meetingContext(meetingId);
  if (context.raw.completed_at || Date.parse(context.raw.starts_at) <= Date.now()) throw new Error("Meeting is no longer upcoming.");
  const { data: counselingCase } = await context.client.from("counseling_cases").select("status,closed_at").eq("id", context.raw.counseling_case_id).maybeSingle();
  if (!counselingCase || counselingCase.closed_at || ["finished", "inactive"].includes(counselingCase.status)) throw new Error("Counseling case is no longer active.");
  if (!context.raw.case_session_id) return { hasHomework: false, homeworkStatus: null as HomeworkState, sessionTitle: "Initial Meeting" };
  const { data: session } = await context.client.from("case_sessions").select("title,status,homework_assignment_revision_id").eq("id", context.raw.case_session_id).maybeSingle();
  if (!session || session.status !== "active") throw new Error("Session is no longer active.");
  if (!session.homework_assignment_revision_id) return { hasHomework: false, homeworkStatus: null as HomeworkState, sessionTitle: session.title };
  const { data: revision } = await context.client.from("homework_assignment_revisions").select("id,homework_version_id").eq("id", session.homework_assignment_revision_id).maybeSingle();
  if (!revision) return { hasHomework: false, homeworkStatus: null as HomeworkState, sessionTitle: session.title };
  const [{ data: blocks }, { data: progress }] = await Promise.all([
    context.client.from("homework_version_blocks").select("id").eq("homework_version_id", revision.homework_version_id),
    context.client.from("homework_participant_progress").select("status").eq("assignment_revision_id", revision.id).eq("profile_id", profileId).maybeSingle(),
  ]);
  return { hasHomework: Boolean(blocks?.length), homeworkStatus: (progress?.status as HomeworkState | undefined) ?? null, sessionTitle: session.title };
}

export async function deliverMeetingReminder(input: { meetingId: string; profileId: string; kind: ReminderKind; homeworkStatus: HomeworkState; hasHomework: boolean; sessionTitle: string; deliveryKey: string }) {
  return deliverOne(input.meetingId, input.profileId, input.kind, input.deliveryKey, null, { homeworkStatus: input.homeworkStatus, hasHomework: input.hasHomework, sessionTitle: input.sessionTitle });
}

export async function getMeetingNotificationRows(caseId: string, meetingId: string) {
  const client = await import("@/lib/supabase/server").then(({ createServerSupabaseClient }) => createServerSupabaseClient());
  const { data, error } = await client.from("notification_deliveries").select("id,event_type,template_key,recipient_profile_id,recipient_email,status,error_category,error_message,created_at,attempt_number").eq("counseling_case_id", caseId).eq("meeting_id", meetingId).order("created_at");
  if (error) return [];
  return data ?? [];
}
