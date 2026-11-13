"use server";
import { createHash, randomUUID } from "crypto";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { handoffMessage, type PhotoHandoffState } from "./handoff-state";
import { buildPhotoHandoffUrl } from "./photo-handoff-url";
import { removeUnpublishedHandoffPhoto, storeHandoffPhoto } from "./profile-photo-server";

type Handoff = { id: string; profile_id: string; expires_at: string; completed_at: string | null };
type HandoffAdmin = ReturnType<typeof admin> & {
  rpc(name: "claim_profile_photo_handoff_upload", args: { target_token_hash: string; target_attempt_id: string }): Promise<{ data: { profile_id: string; object_path: string; stale_object_path: string | null } | null; error: { message: string } | null }>;
  rpc(name: "finalize_profile_photo_handoff_upload", args: { target_token_hash: string; target_attempt_id: string }): Promise<{ data: boolean | null; error: { message: string } | null }>;
  rpc(name: "release_profile_photo_handoff_upload", args: { target_token_hash: string; target_attempt_id: string }): Promise<{ data: { state: "released" | "published" | "superseded"; object_path: string } | null; error: { message: string } | null }>;
};
function hash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function admin() { const { url } = getSupabaseEnvironment(); return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function lookup(token: string) { const { data } = await admin().from("profile_photo_handoffs").select("id,profile_id,expires_at,completed_at").eq("token_hash", hash(token)).maybeSingle(); return data as Handoff | null; }
async function state(token: string): Promise<PhotoHandoffState> { const handoff = await lookup(token); if (!handoff) return "invalid"; if (handoff.completed_at) return "completed"; return new Date(handoff.expires_at) > new Date() ? "active" : "expired"; }
export async function createPhotoHandoff() { const supabase = await createServerSupabaseClient(); const client = supabase as unknown as { rpc(name: "create_profile_photo_handoff", args: Record<string, never>): Promise<{ data: { token: string; expires_at: string; superseded_paths?: string[] } | null; error: { message: string } | null }> }; const { data, error } = await client.rpc("create_profile_photo_handoff", {}); if (error || !data) return { success: false as const, error: "We could not create a phone handoff." }; await Promise.allSettled((data.superseded_paths ?? []).map((path) => removeUnpublishedHandoffPhoto(path))); const baseUrl = process.env.HANDOFF_APP_URL || process.env.APP_URL || (await headers()).get("origin") || ""; let url: string; try { url = buildPhotoHandoffUrl(baseUrl, data.token); } catch { return { success: false as const, error: "We could not create a phone handoff." }; } return { success: true as const, token: data.token, expiresAt: data.expires_at, url }; }

async function settleUpload(client: HandoffAdmin, tokenHash: string, attemptId: string) {
  const { data, error } = await client.rpc("release_profile_photo_handoff_upload", { target_token_hash: tokenHash, target_attempt_id: attemptId });
  if (error || !data) return null;
  if (data.state === "published") return { published: true } as const;
  await removeUnpublishedHandoffPhoto(data.object_path);
  return { published: false } as const;
}

export async function uploadPhonePhoto(token: string, image: Blob) {
  if (image.size === 0) return { success: false as const, error: "Choose a profile photo before uploading." };
  const tokenHash = hash(token);
  const attemptId = randomUUID();
  const client = admin() as HandoffAdmin;
  const { data: claim, error: claimError } = await client.rpc("claim_profile_photo_handoff_upload", { target_token_hash: tokenHash, target_attempt_id: attemptId });
  if (claimError || !claim) {
    const currentState = await state(token);
    return currentState !== "active"
      ? { success: false as const, error: handoffMessage(currentState) }
      : { success: false as const, error: "A photo upload is already in progress. Please wait and try again." };
  }

  if (claim.stale_object_path) await removeUnpublishedHandoffPhoto(claim.stale_object_path);
  try {
    const stored = await storeHandoffPhoto(claim.profile_id, attemptId, image);
    if (!stored.success) {
      await settleUpload(client, tokenHash, attemptId);
      return stored;
    }

    const finalized = await client.rpc("finalize_profile_photo_handoff_upload", { target_token_hash: tokenHash, target_attempt_id: attemptId });
    if (!finalized.error && finalized.data) return { success: true as const };

    const settled = await settleUpload(client, tokenHash, attemptId);
    return settled?.published
      ? { success: true as const }
      : { success: false as const, error: "We could not save the photo. Please try again." };
  } catch {
    const settled = await settleUpload(client, tokenHash, attemptId).catch(() => null);
    return settled?.published
      ? { success: true as const }
      : { success: false as const, error: "We could not save the photo. Please try again." };
  }
}
export async function photoHandoffStatus(token: string) { return { state: await state(token) }; }
export async function validatePhotoHandoff(token: string) { const handoffState = await state(token); return handoffState === "active" ? { valid: true as const } : { valid: false as const, error: handoffMessage(handoffState) }; }
