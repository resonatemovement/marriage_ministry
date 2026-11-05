import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { IntakeAlertSettings } from "./intake-alert-settings-model";

export async function getIntakeAlertSettings(): Promise<IntakeAlertSettings> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client
    .from("global_reminder_settings")
    .select("intake_ready_for_review_hours,intake_under_review_hours,intake_ready_to_invite_hours,intake_invited_onboarding_hours")
    .eq("id", "global")
    .maybeSingle();

  if (error || !data) throw new Error("Intake alert settings are unavailable.");
  return {
    readyForReviewHours: data.intake_ready_for_review_hours,
    underReviewHours: data.intake_under_review_hours,
    readyToInviteHours: data.intake_ready_to_invite_hours,
    invitedOnboardingHours: data.intake_invited_onboarding_hours,
  };
}
