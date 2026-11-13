import "server-only";

import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";

import { PROFILE_PHOTO_CONTENT_TYPE, profilePhotoHandoffPath, profilePhotoPath, profilePhotoSourceError } from "./profile-photo-contract";

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

  return uploadConvertedPhoto(profilePhotoPath(profileId), converted.image, true);
}

export async function storeHandoffPhoto(profileId: string, attemptId: string, image: UploadFile) {
  const sourceError = profilePhotoSourceError({ name: "profile-photo", size: image.size, type: image.type });
  if (!profileId) return { success: false as const, error: "Profile is required." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId)) return { success: false as const, error: "The profile photo could not be uploaded. Please try again." };
  if (sourceError) return { success: false as const, error: sourceError };

  const converted = await convertProfilePhotoToAvif(image);
  if (!converted.success) return converted;

  return uploadConvertedPhoto(profilePhotoHandoffPath(profileId, attemptId), converted.image, false);
}

async function uploadConvertedPhoto(path: string, image: Buffer, upsert: boolean) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return { success: false as const, error: "Profile photo upload is unavailable." };
  const { url } = getSupabaseEnvironment();
  const storage = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from("profile-photos");
  let replacedExisting = false;
  if (upsert) {
    const profileDirectory = path.slice(0, path.lastIndexOf("/"));
    const { data: existing, error: existingError } = await storage.list(profileDirectory, { search: "avatar.avif" });
    if (existingError) return { success: false as const, error: "The profile photo could not be uploaded. Please try again." };
    replacedExisting = existing.some((item) => item.name === "avatar.avif");
  }
  const upload = await storage.upload(path, image, { contentType: PROFILE_PHOTO_CONTENT_TYPE, upsert });
  return upload.error ? { success: false as const, error: "The profile photo could not be uploaded. Please try again." } : { success: true as const, path, replacedExisting };
}

export async function removeNewProfilePhoto(path: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return;
  const { url } = getSupabaseEnvironment();
  await createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } }).storage.from("profile-photos").remove([path]);
}

export async function removeUnpublishedHandoffPhoto(path: string) {
  if (!/^profiles\/[0-9a-f-]{36}\/handoffs\/[0-9a-f-]{36}\.avif$/i.test(path)) return;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return;
  const { url } = getSupabaseEnvironment();
  const client = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: active, error } = await client.from("profiles").select("id").eq("photo_path", path).maybeSingle();
  if (error || active) return;
  await client.storage.from("profile-photos").remove([path]);
}
