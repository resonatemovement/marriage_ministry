"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { parseIntakeAlertSettings, type IntakeAlertSettings, type IntakeAlertSettingsErrors } from "./intake-alert-settings-model";

type SaveResult = { success: true; settings: IntakeAlertSettings } | { error: string; fieldErrors?: IntakeAlertSettingsErrors };

export async function saveIntakeAlertSettings(formData: FormData): Promise<SaveResult> {
  await requireOneOfRoles(["admin", "super_admin"], "/settings");
  const parsed = parseIntakeAlertSettings(formData);
  if (parsed.errors) return { error: "Correct the highlighted Intake Request alert settings.", fieldErrors: parsed.errors };

  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("update_global_intake_alert_settings", {
    next_ready_for_review_hours: parsed.data.readyForReviewHours,
    next_under_review_hours: parsed.data.underReviewHours,
    next_ready_to_invite_hours: parsed.data.readyToInviteHours,
    next_invited_onboarding_hours: parsed.data.invitedOnboardingHours,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { error: "Intake alert settings could not be saved. Try again." };

  revalidatePath("/settings");
  return {
    success: true,
    settings: {
      readyForReviewHours: row.ready_for_review_hours,
      underReviewHours: row.under_review_hours,
      readyToInviteHours: row.ready_to_invite_hours,
      invitedOnboardingHours: row.invited_onboarding_hours,
    },
  };
}
