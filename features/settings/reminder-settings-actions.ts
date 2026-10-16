"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { parseReminderSettings, type ReminderSettings, type ReminderSettingsErrors } from "./reminder-settings-model";

type SaveResult = { success: true; settings: ReminderSettings } | { error: string; fieldErrors?: ReminderSettingsErrors };

export async function saveReminderSettings(formData: FormData): Promise<SaveResult> {
  await requireOneOfRoles(["admin", "super_admin"], "/settings");
  const parsed = parseReminderSettings(formData);
  if (parsed.errors) return { error: "Correct the highlighted reminder settings.", fieldErrors: parsed.errors };

  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_global_reminder_settings", {
    next_meeting_enabled: parsed.data.meetingEnabled,
    next_meeting_hours_before: parsed.data.meetingHoursBefore,
    next_homework_enabled: parsed.data.homeworkEnabled,
    next_homework_hours_before: parsed.data.homeworkHoursBefore,
  });
  if (error || !data) return { error: "Reminder settings could not be saved. Try again." };
  revalidatePath("/settings");
  return {
    success: true,
    settings: {
      meetingEnabled: data.meeting_enabled,
      meetingHoursBefore: data.meeting_hours_before,
      homeworkEnabled: data.homework_enabled,
      homeworkHoursBefore: data.homework_hours_before,
      updatedAt: data.updated_at,
    },
  };
}
