import "server-only";

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";

import { PROFILE_PHOTO_CONTENT_TYPE, profilePhotoPath, profilePhotoSourceError } from "./profile-photo-contract";

type UploadFile = { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string };

export function isProfilePhotoUpload(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "size" in value && "type" in value;
}

export async function convertProfilePhotoToAvif(image: UploadFile) {
  try {
    return { success: true as const, image: await sharp(Buffer.from(await image.arrayBuffer())).rotate().resize(800, 800, { fit: "cover", position: "centre" }).avif({ quality: 50 }).toBuffer() };
  } catch {
    return { success: false as const, error: "This image could not be processed. Choose a different image." };
  }
}

export async function storeProfilePhoto(profileId: string, image: UploadFile) {
  const sourceError = profilePhotoSourceError({ name: "profile-photo", size: image.size, type: image.type });
  if (!profileId) return { success: false as const, error: "Profile is required." };
  if (sourceError) return { success: false as const, error: sourceError };

  const converted = await convertProfilePhotoToAvif(image);
  if (!converted.success) return converted;

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return { success: false as const, error: "Profile photo upload is unavailable." };
  const { url } = getSupabaseEnvironment();
  const storage = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from("profile-photos");
  const path = profilePhotoPath(profileId);
  const { data: existing, error: existingError } = await storage.list(`profiles/${profileId}`, { search: "avatar.avif" });
  if (existingError) return { success: false as const, error: "The profile photo could not be uploaded. Please try again." };
  const replacedExisting = existing.some((item) => item.name === "avatar.avif");
  const upload = await storage.upload(path, converted.image, { contentType: PROFILE_PHOTO_CONTENT_TYPE, upsert: true });
  return upload.error ? { success: false as const, error: "The profile photo could not be uploaded. Please try again." } : { success: true as const, path, replacedExisting };
}

export async function removeNewProfilePhoto(path: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return;
  const { url } = getSupabaseEnvironment();
  await createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from("profile-photos").remove([path]);
}
