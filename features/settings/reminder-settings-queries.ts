import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { ReminderSettings } from "./reminder-settings-model";

export async function getReminderSettings(): Promise<ReminderSettings> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("global_reminder_settings").select("meeting_enabled,meeting_hours_before,homework_enabled,homework_hours_before,updated_at").eq("id", "global").maybeSingle();
  if (error) throw new Error("Reminder settings are unavailable.");
  if (!data) throw new Error("Reminder settings are unavailable.");
  return {
    meetingEnabled: data.meeting_enabled,
    meetingHoursBefore: data.meeting_hours_before,
    homeworkEnabled: data.homework_enabled,
    homeworkHoursBefore: data.homework_hours_before,
    updatedAt: data.updated_at,
  };
}
