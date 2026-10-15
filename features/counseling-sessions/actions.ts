"use server";

import { revalidatePath } from "next/cache";
import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isDevCounselingProject } from "./dev-reset";
import { dispatchMeetingNotifications, resendMeetingNotification as resendMeetingEmail } from "@/features/notifications/meeting-notifications";
import { validateCanonicalMeetingStart } from "./scheduling-validation";

const CARE_ROLES = ["campus_lead", "coach", "counselor"] as const;
function required(formData: FormData, name: string) { const value = formData.get(name); return typeof value === "string" && value.trim() ? value.trim() : null; }

function meetingTimes(formData: FormData) {
  const date = required(formData, "date");
  const time = required(formData, "time");
  if (!date || !time) return { error: "Meeting date and time are required." } as const;
  const validation = validateCanonicalMeetingStart(date, time);
  if (validation.dateError || validation.timeError || !validation.instant) return { error: validation.dateError ?? validation.timeError ?? "Enter a valid meeting date and time." } as const;
  const starts = validation.instant;
  return { startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 60 * 60 * 1000).toISOString() } as const;
}

function revalidateCase(caseId: string) {
  revalidatePath("/workspace");
  revalidatePath(`/workspace/cases/${caseId}`);
}

export async function scheduleInitialMeeting(formData: FormData) {
  await requireOneOfRoles([...CARE_ROLES, "super_admin"], "/workspace");
  const caseId = required(formData, "caseId");
  const times = meetingTimes(formData);
  if (!caseId) return { error: "Counseling case is unavailable." };
  if ("error" in times) return times;
  const supabase = await createServerSupabaseClient();
  const { data: priorMeeting } = await supabase.from("case_session_meetings").select("id,starts_at").eq("counseling_case_id", caseId).is("session_id", null).is("completed_at", null).maybeSingle();
  const { data: meetingId, error } = await supabase.rpc("schedule_initial_case_meeting", { target_case_id: caseId, target_starts_at: times.startsAt, target_ends_at: times.endsAt });
  if (error) return { error: error.message };
  const notificationKind = priorMeeting && priorMeeting.starts_at !== times.startsAt ? "meeting.rescheduled" : "meeting.scheduled";
  await dispatchMeetingNotifications(meetingId, notificationKind);
  revalidateCase(caseId);
  return { success: true };
}

export async function completeInitialMeeting(formData: FormData) {
  await requireOneOfRoles([...CARE_ROLES, "super_admin"], "/workspace");
  const caseId = required(formData, "caseId");
  const sessionId = required(formData, "sessionId");
  const times = meetingTimes(formData);
  if (!caseId || !sessionId) return { error: "Counseling case and next Session are required." };
  if ("error" in times) return times;
  const supabase = await createServerSupabaseClient();
  const { data: caseSessionId, error } = await supabase.rpc("activate_first_case_session", { target_case_id: caseId, target_session_id: sessionId, target_starts_at: times.startsAt, target_ends_at: times.endsAt });
  if (error) return { error: error.message };
  const { data: meeting } = await supabase.from("case_session_meetings").select("id").eq("case_session_id", caseSessionId).is("completed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (meeting) await dispatchMeetingNotifications(meeting.id, "meeting.scheduled");
  revalidateCase(caseId);
  return { success: true };
}

export async function completeSessionScheduleNext(formData: FormData) {
  const identity = await requireOneOfRoles([...CARE_ROLES, "admin", "super_admin"] as const, "/workspace");
  const caseId = required(formData, "caseId");
  const caseSessionId = required(formData, "caseSessionId");
  const sessionId = required(formData, "sessionId");
  const rawOverrideConfirmation = formData.get("overrideConfirmation");
  const overrideConfirmation = typeof rawOverrideConfirmation === "string" ? rawOverrideConfirmation : null;
  const times = meetingTimes(formData);
  if (!caseId || !caseSessionId || !sessionId) return { error: "Counseling case and next Session are required." };
  if ("error" in times) return times;
  const isAdmin = identity.roles.some((role) => role === "admin" || role === "super_admin");
  const supabase = await createServerSupabaseClient();
  const { data: activatedCaseSessionId, error } = await supabase.rpc("complete_case_session_schedule_next", {
    target_case_session_id: caseSessionId,
    target_session_id: sessionId,
    target_starts_at: times.startsAt,
    target_ends_at: times.endsAt,
    override_confirmation: isAdmin ? overrideConfirmation ?? undefined : undefined,
  });
  if (error) return { error: error.message };
  const { data: meeting } = await supabase.from("case_session_meetings").select("id").eq("case_session_id", activatedCaseSessionId).is("completed_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (meeting) await dispatchMeetingNotifications(meeting.id, "meeting.scheduled");
  revalidateCase(caseId);
  return { success: true };
}

export async function scheduleFollowupMeeting(formData: FormData) {
  await requireOneOfRoles([...CARE_ROLES, "super_admin"], "/workspace");
  const caseId = required(formData, "caseId");
  const caseSessionId = required(formData, "caseSessionId");
  const times = meetingTimes(formData);
  if (!caseId || !caseSessionId) return { error: "The active Couple Session is unavailable." };
  if ("error" in times) return times;
  const supabase = await createServerSupabaseClient();
  const { data: meetingId, error } = await supabase.rpc("schedule_followup_case_session_meeting", {
    target_case_session_id: caseSessionId,
    target_starts_at: times.startsAt,
    target_ends_at: times.endsAt,
  });
  if (error) return { error: error.message };
  await dispatchMeetingNotifications(meetingId, "meeting.scheduled");
  revalidateCase(caseId);
  return { success: true };
}

export async function completeCounselingProgram(formData: FormData) {
  const identity = await requireOneOfRoles([...CARE_ROLES, "admin", "super_admin"] as const, "/workspace");
  const caseId = required(formData, "caseId");
  const caseSessionId = required(formData, "caseSessionId");
  const rawOverrideConfirmation = formData.get("overrideConfirmation");
  const overrideConfirmation = typeof rawOverrideConfirmation === "string" ? rawOverrideConfirmation : null;
  if (!caseId || !caseSessionId) return { error: "The active Couple Session is unavailable." };
  const isAdmin = identity.roles.some((role) => role === "admin" || role === "super_admin");
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("complete_counseling_program", {
    target_case_session_id: caseSessionId,
    override_confirmation: isAdmin ? overrideConfirmation ?? undefined : undefined,
  });
  if (error) return { error: error.message };
  revalidateCase(caseId);
  return { success: true };
}

export async function closeCounselingCaseIncomplete(formData: FormData) {
  const identity = await requireOneOfRoles([...CARE_ROLES, "admin", "super_admin"] as const, "/workspace");
  const caseId = required(formData, "caseId");
  const caseSessionId = required(formData, "caseSessionId");
  const reason = required(formData, "closureReason");
  const notes = required(formData, "closureNotes");
  if (!caseId || !caseSessionId) return { error: "The active Couple Session is unavailable." };
  const isAdmin = identity.roles.some((role) => role === "admin" || role === "super_admin");
  if (!isAdmin && !reason) return { error: "Select a reason for closing this counseling case." };
  if (reason === "Other" && !notes) return { error: "Add notes when the closure reason is Other." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("close_counseling_case_incomplete", {
    target_case_session_id: caseSessionId,
    closure_reason: reason ?? undefined,
    closure_notes: notes ?? undefined,
  });
  if (error) return { error: error.message };
  revalidateCase(caseId);
  return { success: true };
}

export async function rescheduleSessionMeeting(formData: FormData) {
  await requireOneOfRoles([...CARE_ROLES, "super_admin"], "/workspace");
  const caseId = required(formData, "caseId");
  const meetingId = required(formData, "meetingId");
  const times = meetingTimes(formData);
  if (!caseId || !meetingId) return { error: "Scheduled meeting is unavailable." };
  if ("error" in times) return times;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("reschedule_case_session_meeting", { target_meeting_id: meetingId, target_starts_at: times.startsAt, target_ends_at: times.endsAt });
  if (error) return { error: error.message };
  await dispatchMeetingNotifications(meetingId, "meeting.rescheduled");
  revalidateCase(caseId);
  return { success: true };
}

export async function resendMeetingNotification(formData: FormData) {
  await requireOneOfRoles([...CARE_ROLES, "admin", "super_admin"] as const, "/workspace");
  const caseId = required(formData, "caseId");
  const meetingId = required(formData, "meetingId");
  const deliveryId = required(formData, "deliveryId");
  const profileId = required(formData, "profileId");
  if (!caseId || !meetingId || !deliveryId || !profileId) return { error: "Meeting notification is unavailable." };
  const supabase = await createServerSupabaseClient();
  const { data: meeting } = await supabase.from("case_session_meetings").select("id,counseling_case_id,completed_at").eq("id", meetingId).eq("counseling_case_id", caseId).maybeSingle();
  if (!meeting || meeting.completed_at) return { error: "Only a current scheduled Meeting can be resent." };
  const { data: delivery } = await supabase.from("notification_deliveries").select("id,recipient_profile_id,status,counseling_case_id,meeting_id").eq("id", deliveryId).eq("counseling_case_id", caseId).eq("meeting_id", meetingId).maybeSingle();
  if (!delivery || delivery.recipient_profile_id !== profileId) return { error: "Meeting notification is unavailable." };
  if (["bounced", "complained", "suppressed"].includes(delivery.status)) return { error: "Resend is blocked because this address is bounced, complained, or suppressed." };
  const result = await resendMeetingEmail(meetingId, profileId, deliveryId);
  if ("error" in result) return result;
  revalidateCase(caseId);
  return result;
}

export async function resetCounselingJourney(formData: FormData) {
  await requireOneOfRoles(["super_admin"], "/workspace");
  if (!isDevCounselingProject()) return { error: "Counseling journey reset is available only in DEV." };
  const caseId = required(formData, "caseId");
  const confirmation = formData.get("confirmation");
  if (!caseId) return { error: "Counseling case is unavailable." };
  if (confirmation !== "RESET") return { error: "Type exact uppercase RESET to continue." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("reset_counseling_journey", {
    target_case_id: caseId,
    reset_confirmation: confirmation,
  });
  if (error) return { error: error.message };
  revalidateCase(caseId);
  return { success: true };
}
