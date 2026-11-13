import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; };
const client = (url: string, key: string) => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const imageFor = (background: { r: number; g: number; b: number }) => sharp({ create: { width: 64, height: 64, channels: 3, background } }).jpeg().toBuffer();

type HandoffService = {
  rpc(name: "claim_profile_photo_handoff_upload", args: { target_token_hash: string; target_attempt_id: string }): Promise<{ data: { profile_id: string; object_path: string; stale_object_path: string | null } | null; error: { message: string } | null }>;
  rpc(name: "finalize_profile_photo_handoff_upload", args: { target_token_hash: string; target_attempt_id: string }): Promise<{ data: boolean | null; error: { message: string } | null }>;
  rpc(name: "release_profile_photo_handoff_upload", args: { target_token_hash: string; target_attempt_id: string }): Promise<{ data: { state: "released" | "published" | "superseded"; object_path: string } | null; error: { message: string } | null }>;
};

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Photo-handoff verification refused: configured project is not approved DEV.");
  const base = new URL(process.env.PHOTO_HANDOFF_TEST_BASE_URL ?? "http://127.0.0.1:3000");
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(base.hostname)) throw new Error("Photo-handoff verification requires a local application server.");

  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const service = admin as unknown as HandoffService;
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const credentials = ["a", "b"].map((name) => ({ email: `verify-handoff-${name}-${suffix}@example.test`, password: `Verify-${randomUUID()}!` }));
  const users: { id: string; client: ReturnType<typeof client> }[] = [];
  const imageA = await imageFor({ r: 235, g: 30, b: 30 });
  const imageB = await imageFor({ r: 25, g: 35, b: 235 });

  async function createHandoff(user: ReturnType<typeof client>) {
    const rpc = user as unknown as { rpc(name: "create_profile_photo_handoff", args: Record<string, never>): Promise<{ data: { token: string; expires_at: string; superseded_paths?: string[] } | null; error: { message: string } | null }> };
    const result = await rpc.rpc("create_profile_photo_handoff", {});
    if (result.error || !result.data) throw new Error("Unable to create synthetic handoff fixture.");
    for (const path of result.data.superseded_paths ?? []) await removeIfUnpublished(path);
    return result.data.token;
  }

  async function removeIfUnpublished(path: string) {
    const { data, error } = await admin.from("profiles").select("id").eq("photo_path", path).maybeSingle();
    if (!error && !data) await admin.storage.from("profile-photos").remove([path]);
  }

  async function post(token: string, image: Buffer, type = "image/jpeg") {
    return fetch(new URL(`/api/onboarding/photo-handoff/${encodeURIComponent(token)}`, base), { method: "POST", headers: { "content-type": type }, body: new Blob([new Uint8Array(image)]) });
  }

  try {
    const { data: campus, error: campusError } = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
    if (campusError || !campus) throw new Error("An active DEV campus is required for synthetic fixtures.");
    for (const entry of credentials) {
      const { data, error } = await admin.auth.admin.createUser({ email: entry.email, password: entry.password, email_confirm: true });
      if (error || !data.user) throw new Error("Unable to create a synthetic onboarding user.");
      const id = data.user.id;
      const userClient = client(url, publishableKey);
      users.push({ id, client: userClient });
      const { error: profileError } = await admin.from("profiles").upsert({ id, campus_id: campus.id, first_name: "Handoff", last_name: "Verify", email: entry.email, phone: "+15551234567", status: "onboarding", deactivated_at: null }, { onConflict: "id" });
      if (profileError) throw new Error("Unable to create a synthetic onboarding profile.");
      const { error: signInError } = await userClient.auth.signInWithPassword(entry);
      if (signInError) throw new Error("Unable to authenticate a synthetic onboarding user.");
    }

    const token = await createHandoff(users[0]!.client);
    const parallel = await Promise.all([post(token, imageA), post(token, imageB)]);
    const successIndexes = parallel.flatMap((response, index) => response.status === 200 ? [index] : []);
    if (successIndexes.length !== 1) throw new Error("Parallel upload did not produce exactly one successful publication.");
    const successful = await parallel[successIndexes[0]!]!.json() as { success?: boolean };
    if (successful.success !== true) throw new Error("The winning parallel upload did not return success.");

    const { data: profileA, error: profileAError } = await admin.from("profiles").select("photo_path").eq("id", users[0]!.id).single();
    if (profileAError || !profileA?.photo_path || !new RegExp(`^profiles/${users[0]!.id}/handoffs/[0-9a-f-]{36}\\.avif$`, "i").test(profileA.photo_path)) throw new Error("The winning upload was not atomically published to its unique profile path.");
    const stored = await admin.storage.from("profile-photos").download(profileA.photo_path);
    if (stored.error || !stored.data) throw new Error("The published photo object is missing.");
    const pixel = await sharp(Buffer.from(await stored.data.arrayBuffer())).resize(1, 1).removeAlpha().raw().toBuffer();
    const winnerImage = successIndexes[0] === 0 ? imageA : imageB;
    const winnerPixel = await sharp(winnerImage).resize(1, 1).removeAlpha().raw().toBuffer();
    const redWinner = winnerPixel[0]! > winnerPixel[2]!;
    if ((pixel[0]! > pixel[2]!) !== redWinner) throw new Error("The published image does not match the single successful request.");
    const reused = await post(token, imageA);
    if (reused.status === 200) throw new Error("A completed handoff token was reusable.");
    const { data: profileBBeforeRetry } = await admin.from("profiles").select("photo_path").eq("id", users[1]!.id).single();
    if (profileBBeforeRetry?.photo_path) throw new Error("A handoff changed an unrelated profile.");

    const retryToken = await createHandoff(users[1]!.client);
    const invalidImage = await post(retryToken, Buffer.from("not an image"), "text/plain");
    if (invalidImage.status === 200) throw new Error("An unsupported upload was accepted.");
    const retry = await post(retryToken, imageA);
    if (retry.status !== 200) throw new Error("A legitimate retry after a failed upload was rejected.");

    const replacedToken = await createHandoff(users[1]!.client);
    const attemptId = randomUUID();
    const replacedClaim = await service.rpc("claim_profile_photo_handoff_upload", { target_token_hash: hash(replacedToken), target_attempt_id: attemptId });
    if (replacedClaim.error || !replacedClaim.data) throw new Error("Unable to claim a replacement-race fixture.");
    const newerToken = await createHandoff(users[1]!.client);
    const oldUpload = await admin.storage.from("profile-photos").upload(replacedClaim.data.object_path, await sharp(imageB).avif().toBuffer(), { contentType: "image/avif", upsert: false });
    if (oldUpload.error) throw new Error("Unable to create an isolated in-flight upload fixture.");
    const replacedFinalize = await service.rpc("finalize_profile_photo_handoff_upload", { target_token_hash: hash(replacedToken), target_attempt_id: attemptId });
    if (!replacedFinalize.error && replacedFinalize.data !== false) throw new Error("A replaced in-flight handoff was accepted unexpectedly.");
    const released = await service.rpc("release_profile_photo_handoff_upload", { target_token_hash: hash(replacedToken), target_attempt_id: attemptId });
    if (released.error || !released.data || !["released", "superseded"].includes(released.data.state)) throw new Error("Replaced upload cleanup state was not safe.");
    await removeIfUnpublished(released.data.object_path);
    const finalUpload = await post(newerToken, imageB);
    if (finalUpload.status !== 200) throw new Error("The current replacement handoff could not publish.");

    const expiredToken = randomUUID();
    const { error: expiredInsertError } = await admin.from("profile_photo_handoffs").insert({ profile_id: users[1]!.id, token_hash: hash(expiredToken), expires_at: new Date(Date.now() - 60_000).toISOString() });
    if (expiredInsertError) throw new Error("Unable to create an expired synthetic handoff fixture.");
    const expired = await post(expiredToken, imageA);
    if (expired.status === 200) throw new Error("An expired handoff was accepted.");
    const { data: profileB, error: profileBError } = await admin.from("profiles").select("photo_path").eq("id", users[1]!.id).single();
    if (profileBError || !profileB?.photo_path || !new RegExp(`^profiles/${users[1]!.id}/handoffs/[0-9a-f-]{36}\\.avif$`, "i").test(profileB.photo_path)) throw new Error("The replacement profile photo path is invalid.");

    console.log("DEV photo-handoff checks passed: concurrent single-winner publication, winner-image integrity, sequential reuse denial, failed-upload retry, replacement during an in-flight claim, expired-token denial, and profile isolation.");
  } finally {
    const cleanupErrors: string[] = [];
    for (const { id } of users) {
      const { data: handoffs } = await admin.from("profile_photo_handoffs").select("upload_object_path").eq("profile_id", id);
      const paths = [...new Set([`profiles/${id}/avatar.avif`, `profiles/${id}/avatar.webp`, ...(handoffs ?? []).map((row) => row.upload_object_path).filter((path): path is string => Boolean(path))])];
      const { error: storageError } = await admin.storage.from("profile-photos").remove(paths);
      if (storageError) cleanupErrors.push("storage");
      const { error: profileError } = await admin.from("profiles").delete().eq("id", id);
      if (profileError) cleanupErrors.push("profile");
      const { data: remainingProfile } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
      if (remainingProfile) cleanupErrors.push("profile verification");
      const { error: userError } = await admin.auth.admin.deleteUser(id);
      if (userError) cleanupErrors.push("auth");
      const { data: remainingUser } = await admin.auth.admin.getUserById(id);
      if (remainingUser.user) cleanupErrors.push("auth verification");
    }
    if (cleanupErrors.length) throw new Error(`Synthetic DEV fixture cleanup could not be verified (${cleanupErrors.length} failed checks).`);
  }
}

await main();
