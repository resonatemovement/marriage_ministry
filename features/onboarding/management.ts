"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePhone } from "./phone";
import { isValidPhone } from "./phone";
import { isProfilePhotoUpload, removeNewProfilePhoto, storeProfilePhoto } from "./profile-photo-server";

type Result = { success: true } | { error: string };
type ManagementClient = { rpc(name: "admin_assert_incomplete_profile" | "admin_update_incomplete_profile" | "admin_complete_onboarding" | "admin_set_profile_photo", args: Record<string, unknown>): Promise<{ error: { message: string } | null }> };

function value(formData: FormData, name: string) { const raw = formData.get(name); return typeof raw === "string" ? raw.trim() : ""; }

export async function recoverIncompleteProfile(formData: FormData): Promise<Result> {
  const profileId = value(formData, "profileId");
  const firstName = value(formData, "firstName");
  const lastName = value(formData, "lastName");
  const phone = value(formData, "phone");
  const campusId = value(formData, "campusId");
  if (!profileId || !firstName || !lastName || !phone || !campusId || !isValidPhone(phone)) return { error: "Complete all required fields with a valid phone and campus." };
  await requireWorkspace("admin", `/people/${profileId}`);
  const client = (await createServerSupabaseClient()) as unknown as ManagementClient;
  const { error } = await client.rpc("admin_update_incomplete_profile", { target_profile_id: profileId, target_first_name: firstName, target_last_name: lastName, target_phone: normalizePhone(phone), target_campus_id: campusId });
  if (error) return { error: error.message };
  revalidatePath(`/people/${profileId}`); revalidatePath("/people");
  return { success: true };
}

export async function updateOwnProfile(formData: FormData): Promise<Result> {
  const firstName = value(formData, "firstName"); const lastName = value(formData, "lastName"); const phone = value(formData, "phone");
  if (!firstName || !lastName || !phone || !isValidPhone(phone)) return { error: "Enter a first name, last name, and valid phone number." };
  const client = (await createServerSupabaseClient()) as unknown as ManagementClient & { rpc(name: "update_own_profile", args: Record<string, unknown>): Promise<{ error: { message: string } | null }> };
  const { error } = await client.rpc("update_own_profile", { target_first_name: firstName, target_last_name: lastName, target_phone: normalizePhone(phone) });
  if (error) return { error: error.message };
  revalidatePath("/profile"); revalidatePath("/workspace");
  return { success: true };
}

export async function completeIncompleteProfile(profileId: string): Promise<Result> {
  if (!profileId) return { error: "Profile is required." };
  await requireWorkspace("admin", `/people/${profileId}`);
  const client = (await createServerSupabaseClient()) as unknown as ManagementClient;
  const { error } = await client.rpc("admin_complete_onboarding", { target_profile_id: profileId });
  if (error) return { error: error.message };
  revalidatePath(`/people/${profileId}`); revalidatePath("/people");
  return { success: true };
}

export async function uploadAdminProfilePhoto(formData: FormData): Promise<Result> {
  const profileId = value(formData, "profileId");
  const file = formData.get("photo");
  if (!profileId) return { error: "Profile is required." };
  if (!isProfilePhotoUpload(file)) return { error: "Choose a profile photo before uploading." };
  await requireWorkspace("admin", `/people/${profileId}`);
  const client = (await createServerSupabaseClient()) as unknown as ManagementClient;
  const { error: eligibilityError } = await client.rpc("admin_assert_incomplete_profile", { target_profile_id: profileId });
  if (eligibilityError) return { error: eligibilityError.message };
  const uploaded = await storeProfilePhoto(profileId, file);
  if (!uploaded.success) return { error: uploaded.error };
  const { error } = await client.rpc("admin_set_profile_photo", { target_profile_id: profileId });
  if (error) {
    if (!uploaded.replacedExisting) await removeNewProfilePhoto(uploaded.path);
    return { error: error.message };
  }
  revalidatePath(`/people/${profileId}`); revalidatePath("/people");
  return { success: true };
}
