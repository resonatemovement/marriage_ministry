import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; };
const client = (url: string, key: string) => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Photo-handoff verification refused: configured project is not approved DEV.");
  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const credentials = [{ email: `verify-handoff-a-${suffix}@example.test`, password: `Verify-${crypto.randomUUID()}!` }, { email: `verify-handoff-b-${suffix}@example.test`, password: `Verify-${crypto.randomUUID()}!` }];
  const ids: string[] = [];
  try {
    const { data: campus } = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
    if (!campus) throw new Error("Active DEV Campus is required");
    for (const entry of credentials) {
      const { data, error } = await admin.auth.admin.createUser({ email: entry.email, password: entry.password, email_confirm: true });
      if (error || !data.user) throw new Error("Unable to create photo-handoff verification user");
      ids.push(data.user.id);
      const { error: profileError } = await admin.from("profiles").upsert({ id: data.user.id, campus_id: campus.id, first_name: "Handoff", last_name: "Verify", email: entry.email, phone: "+15551234567", status: "onboarding", deactivated_at: null }, { onConflict: "id" });
      if (profileError) throw new Error(profileError.message);
    }
    const userA = client(url, publishableKey); await userA.auth.signInWithPassword(credentials[0]);
    const rpc = userA as unknown as { rpc(name: "create_profile_photo_handoff", args: Record<string, never>): Promise<{ data: { token: string } | null; error: { message: string } | null }> };
    const first = await rpc.rpc("create_profile_photo_handoff", {}); if (first.error || !first.data) throw new Error("Unable to create first handoff");
    const second = await rpc.rpc("create_profile_photo_handoff", {}); if (second.error || !second.data) throw new Error("Unable to create replacement handoff");
    const { data: firstRecord } = await admin.from("profile_photo_handoffs").select("completed_at").eq("token_hash", hash(first.data.token)).single();
    if (!firstRecord?.completed_at) throw new Error("Previous handoff was not invalidated");
    const path = `profiles/${ids[0]}/avatar.avif`;
    const { error: uploadError } = await admin.storage.from("profile-photos").upload(path, new Blob(["AVIF"], { type: "image/avif" }), { contentType: "image/avif", upsert: true }); if (uploadError) throw new Error(uploadError.message);
    const complete = await (admin as unknown as { rpc(name: "complete_profile_photo_handoff", args: { target_token_hash: string }): Promise<{ error: { message: string } | null }> }).rpc("complete_profile_photo_handoff", { target_token_hash: hash(second.data.token) });
    if (complete.error) throw new Error(complete.error.message);
    const { data: profileA } = await admin.from("profiles").select("photo_path").eq("id", ids[0]).single(); const { data: profileB } = await admin.from("profiles").select("photo_path").eq("id", ids[1]).single();
    if (profileA?.photo_path !== path || profileB?.photo_path) throw new Error("Handoff profile isolation failed");
    const reuse = await (admin as unknown as { rpc(name: "complete_profile_photo_handoff", args: { target_token_hash: string }): Promise<{ error: { message: string } | null }> }).rpc("complete_profile_photo_handoff", { target_token_hash: hash(second.data.token) }); if (!reuse.error) throw new Error("Completed handoff was reusable");
    const expiredToken = crypto.randomUUID(); await admin.from("profile_photo_handoffs").insert({ profile_id: ids[1], token_hash: hash(expiredToken), expires_at: new Date(Date.now() - 60_000).toISOString() });
    const expired = await (admin as unknown as { rpc(name: "complete_profile_photo_handoff", args: { target_token_hash: string }): Promise<{ error: { message: string } | null }> }).rpc("complete_profile_photo_handoff", { target_token_hash: hash(expiredToken) }); if (!expired.error) throw new Error("Expired handoff was accepted");
    console.log("DEV profile-photo handoff contract verified.");
  } finally {
    for (const id of ids) { await admin.storage.from("profile-photos").remove([`profiles/${id}/avatar.avif`]); await admin.from("profiles").delete().eq("id", id); await admin.auth.admin.deleteUser(id); }
  }
}
await main();
