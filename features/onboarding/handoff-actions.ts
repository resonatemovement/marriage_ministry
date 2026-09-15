"use server";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { handoffMessage, type PhotoHandoffState } from "./handoff-state";
import { storeProfilePhoto } from "./profile-photo-server";

type Handoff = { id: string; profile_id: string; expires_at: string; completed_at: string | null };
function hash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function admin() { const { url } = getSupabaseEnvironment(); return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function lookup(token: string) { const { data } = await admin().from("profile_photo_handoffs").select("id,profile_id,expires_at,completed_at").eq("token_hash", hash(token)).maybeSingle(); return data as Handoff | null; }
async function state(token: string): Promise<PhotoHandoffState> { const handoff = await lookup(token); if (!handoff) return "invalid"; if (handoff.completed_at) return "completed"; return new Date(handoff.expires_at) > new Date() ? "active" : "expired"; }
async function valid(token: string) { const handoff = await lookup(token); return handoff && !handoff.completed_at && new Date(handoff.expires_at) > new Date() ? handoff : null; }
export async function createPhotoHandoff() { const supabase = await createServerSupabaseClient(); const client = supabase as unknown as { rpc(name: "create_profile_photo_handoff", args: Record<string, never>): Promise<{ data: { token: string; expires_at: string } | null; error: { message: string } | null }> }; const { data, error } = await client.rpc("create_profile_photo_handoff", {}); if (error || !data) return { success: false as const, error: "We could not create a phone handoff." }; const baseUrl = (process.env.HANDOFF_APP_URL || process.env.APP_URL || (await headers()).get("origin") || "").replace(/\/$/, ""); return { success: true as const, token: data.token, expiresAt: data.expires_at, url: `${baseUrl}/onboarding/photo-handoff/${data.token}` }; }
async function completePhoneUpload(token: string) {
  const handoffState = await state(token);
  if (handoffState !== "active") return { success: false as const, error: handoffMessage(handoffState) };
  const { error } = await (admin() as unknown as { rpc(name: "complete_profile_photo_handoff", args: { target_token_hash: string }): Promise<{ error: { message: string } | null }> }).rpc("complete_profile_photo_handoff", { target_token_hash: hash(token) });
  return error ? { success: false as const, error: "We could not save the photo. Please try again." } : { success: true as const };
}
export async function uploadPhonePhoto(token: string, image: Blob) {
  if (image.size === 0) return { success: false as const, error: "Choose a profile photo before uploading." };
  const handoff = await valid(token);
  if (!handoff) return { success: false as const, error: handoffMessage(await state(token)) };
  const stored = await storeProfilePhoto(handoff.profile_id, image);
  if (!stored.success) return { success: false as const, error: stored.error };
  return completePhoneUpload(token);
}
export async function photoHandoffStatus(token: string) { return { state: await state(token) }; }
export async function validatePhotoHandoff(token: string) { const handoffState = await state(token); return handoffState === "active" ? { valid: true as const } : { valid: false as const, error: handoffMessage(handoffState) }; }
