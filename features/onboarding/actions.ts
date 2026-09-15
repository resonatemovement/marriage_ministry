"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { normalizePhone } from "./phone";
import { isValidPhone } from "./phone";
import { profilePhotoPath } from "./profile-photo-contract";
import { isProfilePhotoUpload, storeProfilePhoto } from "./profile-photo-server";

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
  const { data: claims } = await supabase.auth.getClaims();
  const actor = claims?.claims?.sub;
  if (typeof actor === "string") {
    const { data: rawProfile } = await supabase.from("profiles").select("status,first_name,last_name,email,phone,photo_path").eq("id", actor).maybeSingle();
    const profile = rawProfile as unknown as { status: string; first_name: string; last_name: string; email: string | null; phone: string | null; photo_path: string | null } | null;
    if (profile?.status === "active") {
      const client = supabase as unknown as OnboardingClient & { rpc(name: "update_own_profile", args: Record<string, unknown>): Promise<{ error: { message: string } | null }> };
      const { error } = await client.rpc("update_own_profile", { target_first_name: profile.first_name, target_last_name: profile.last_name, target_phone: profile.phone, target_photo_path: profilePhotoPath(actor) });
      return error ? { success: false, error: "We could not save your profile photo. Please try again." } : { success: true };
    }
  }
  const client = supabase as unknown as OnboardingClient;
  const { error } = await client.rpc("record_onboarding_photo", {});
  return error ? { success: false, error: "We could not save your profile photo. Please try again." } : { success: true };
}

export async function uploadOwnProfilePhoto(formData: FormData): Promise<SaveOnboardingResult> {
  const file = formData.get("photo");
  if (!isProfilePhotoUpload(file)) return { success: false, error: "Choose a profile photo before uploading." };
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const actor = claims?.claims?.sub;
  if (typeof actor !== "string") return { success: false, error: "Sign in through your invitation email to continue." };
  const stored = await storeProfilePhoto(actor, file);
  if (!stored.success) return { success: false, error: stored.error };
  return recordOnboardingPhoto();
}

export async function completeOnboarding(): Promise<SaveOnboardingResult> {
  const supabase = await createServerSupabaseClient();
  const client = supabase as unknown as OnboardingClient;
  const { error } = await client.rpc("complete_onboarding", {});
  return error ? { success: false, error: "Complete your profile details and photo before continuing." } : { success: true };
}
