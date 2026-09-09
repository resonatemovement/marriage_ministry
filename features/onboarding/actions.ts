"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { normalizePhone } from "./phone";
import { isValidPhone } from "./phone";

type SaveOnboardingResult = { success: true } | { success: false; error: string };

type OnboardingClient = {
  rpc(
    name: "save_onboarding_profile",
    args: { target_first_name: string | null; target_last_name: string | null; target_phone: string | null },
  ): Promise<{ error: { message: string } | null }>;
  rpc(name: "record_onboarding_photo", args: Record<string, never>): Promise<{ error: { message: string } | null }>;
  rpc(name: "complete_onboarding", args: Record<string, never>): Promise<{ error: { message: string } | null }>;
};

export async function saveOnboardingProfile(fields: { firstName: string; lastName: string; phone: string }): Promise<SaveOnboardingResult> {
  if (fields.phone.trim() && !isValidPhone(fields.phone)) return { success: false, error: "Enter a valid phone number." };

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return { success: false, error: "Sign in through your invitation email to continue." };

  const client = supabase as unknown as OnboardingClient;
  const { error } = await client.rpc("save_onboarding_profile", {
    target_first_name: fields.firstName.trim() || null,
    target_last_name: fields.lastName.trim() || null,
    target_phone: fields.phone.trim() ? normalizePhone(fields.phone) : null,
  });

  if (error) return { success: false, error: "We could not save your profile details. Please try again." };
  return { success: true };
}

export async function recordOnboardingPhoto(): Promise<SaveOnboardingResult> {
  const supabase = await createServerSupabaseClient();
  const client = supabase as unknown as OnboardingClient;
  const { error } = await client.rpc("record_onboarding_photo", {});
  return error ? { success: false, error: "We could not save your profile photo. Please try again." } : { success: true };
}

export async function completeOnboarding(): Promise<SaveOnboardingResult> {
  const supabase = await createServerSupabaseClient();
  const client = supabase as unknown as OnboardingClient;
  const { error } = await client.rpc("complete_onboarding", {});
  return error ? { success: false, error: "Complete your profile details and photo before continuing." } : { success: true };
}
