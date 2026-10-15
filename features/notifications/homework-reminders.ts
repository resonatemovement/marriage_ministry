import "server-only";

import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { deliverMeetingReminder } from "./meeting-notifications";
import { reminderDeliveryKey, reminderIsDue, shouldSendReminder, type HomeworkState, type ReminderKind, type ReminderMeeting } from "./reminder-rules";

type MeetingRow = { id: string; counseling_case_id: string; case_session_id: string | null; session_id: string | null; starts_at: string; updated_at: string; completed_at: string | null };
type PartnerRow = { id: string; first_name: string; email: string | null };

function activeCaseStatus(status: string, closedAt: string | null) {
  return closedAt === null && status !== "finished" && status !== "inactive";
}

async function caseContext(client: ReturnType<typeof createServiceRoleSupabaseClient>, meeting: MeetingRow) {
  const { data: counselingCase, error: caseError } = await client.from("counseling_cases").select("status,closed_at,couple_group_id").eq("id", meeting.counseling_case_id).maybeSingle();
  if (caseError || !counselingCase || !activeCaseStatus(counselingCase.status, counselingCase.closed_at)) return null;
  const { data: members, error: memberError } = await client.from("group_members").select("profile:profiles(id,first_name,email)").eq("group_id", counselingCase.couple_group_id).is("ended_at", null);
  if (memberError) throw new Error(memberError.message);
  const partners = (members ?? []).flatMap((member) => member.profile ? [member.profile as unknown as PartnerRow] : []);
  if (partners.length !== 2) return null;

  if (!meeting.case_session_id) {
    return { partners, active: meeting.session_id === null, hasHomework: false, title: "Initial Meeting", homework: new Map<string, HomeworkState>() };
  }

  const { data: session, error: sessionError } = await client.from("case_sessions").select("id,title,status,homework_assignment_revision_id").eq("id", meeting.case_session_id).eq("counseling_case_id", meeting.counseling_case_id).maybeSingle();
  if (sessionError || !session) return null;
  if (!session.homework_assignment_revision_id) return { partners, active: session.status === "active", hasHomework: false, title: session.title, homework: new Map<string, HomeworkState>() };
  const { data: revision, error: revisionError } = await client.from("homework_assignment_revisions").select("id,homework_version_id").eq("id", session.homework_assignment_revision_id).maybeSingle();
  if (revisionError) throw new Error(revisionError.message);
  if (!revision) return { partners, active: session.status === "active", hasHomework: false, title: session.title, homework: new Map<string, HomeworkState>() };
  const { data: blocks, error: blockError } = await client.from("homework_version_blocks").select("id").eq("homework_version_id", revision.homework_version_id);
  if (blockError) throw new Error(blockError.message);
  const hasHomework = Boolean(blocks?.length);
  if (!hasHomework) return { partners, active: session.status === "active", hasHomework, title: session.title, homework: new Map<string, HomeworkState>() };
  const { data: progressRows, error: progressError } = await client.from("homework_participant_progress").select("profile_id,status").eq("assignment_revision_id", revision.id);
  if (progressError) throw new Error(progressError.message);
  const homework = new Map<string, HomeworkState>((progressRows ?? []).map((row) => [row.profile_id, row.status as HomeworkState]));
  return { partners, active: session.status === "active", hasHomework, title: session.title, homework };
}

export async function processDueMeetingReminders(now = new Date()) {
  const client = createServiceRoleSupabaseClient();
  const nowIso = now.toISOString();
  const latest = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString();
  const { data: meetings, error } = await client.from("case_session_meetings")
    .select("id,counseling_case_id,case_session_id,session_id,starts_at,updated_at,completed_at")
    .gt("starts_at", nowIso).lte("starts_at", latest).is("completed_at", null).order("starts_at").limit(500);
  if (error) throw new Error(error.message);

  let attempted = 0;
  let skipped = 0;
  for (const meeting of (meetings ?? []) as MeetingRow[]) {
    const context = await caseContext(client, meeting);
    if (!context) { skipped++; continue; }
    const state: ReminderMeeting = { id: meeting.id, startsAt: meeting.starts_at, updatedAt: meeting.updated_at, completedAt: meeting.completed_at, caseActive: true, sessionActive: context.active, hasHomework: context.hasHomework };
    const dueKinds: ReminderKind[] = ["homework.reminder.72h", "meeting.reminder.24h"];
    for (const kind of dueKinds) {
      if (kind === "homework.reminder.72h" && (!meeting.case_session_id || !context.hasHomework)) continue;
      if (!reminderIsDue(state, kind, now.getTime())) continue;
      await Promise.all(context.partners.map(async (partner) => {
        const homeworkStatus = context.homework.get(partner.id) ?? null;
        if (!shouldSendReminder(state, kind, homeworkStatus, now.getTime())) return;
        const result = await deliverMeetingReminder({
          meetingId: meeting.id,
          profileId: partner.id,
          kind,
          homeworkStatus,
          hasHomework: context.hasHomework,
          sessionTitle: context.title,
          deliveryKey: reminderDeliveryKey(meeting.id, meeting.starts_at, kind, partner.id),
        });
        if (result.status !== "duplicate") attempted++;
      }));
    }
  }
  return { scanned: meetings?.length ?? 0, attempted, skipped };
}
