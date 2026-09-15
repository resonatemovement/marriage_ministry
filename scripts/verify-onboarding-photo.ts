import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function client(url: string, key: string) { return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Profile-photo verification refused: configured project is not approved DEV.");
  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const email = `verify-photo-${Date.now()}@example.test`; const password = `Verify-${crypto.randomUUID()}!`;
  const { data: campus } = await admin.from("campuses").select("id").eq("active", true).limit(1).single(); if (!campus) throw new Error("Active DEV Campus is required");
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true }); if (createError || !created.user) throw new Error("Unable to create profile-photo verification user");
  const id = created.user.id;
  try {
    const { error: profileError } = await admin.from("profiles").upsert({ id, campus_id: campus.id, first_name: "Photo", last_name: "Verify", email, phone: "+1 555 123 4567", status: "onboarding", deactivated_at: null }, { onConflict: "id" }); if (profileError) throw new Error(profileError.message);
    const user = client(url, publishableKey); const { error: signInError } = await user.auth.signInWithPassword({ email, password }); if (signInError) throw new Error(signInError.message);
    const path = `profiles/${id}/avatar.avif`; const { error: uploadError } = await user.storage.from("profile-photos").upload(path, new Blob(["AVIF"], { type: "image/avif" }), { contentType: "image/avif", upsert: true }); if (uploadError) throw new Error(uploadError.message);
    const photo = await (user as unknown as { rpc(name: "record_onboarding_photo", args: Record<string, never>): Promise<{ error: { message: string } | null }>; }).rpc("record_onboarding_photo", {}); if (photo.error) throw new Error(photo.error.message);
    const complete = await (user as unknown as { rpc(name: "complete_onboarding", args: Record<string, never>): Promise<{ error: { message: string } | null }>; }).rpc("complete_onboarding", {}); if (complete.error) throw new Error(complete.error.message);
    const { data: profile, error } = await admin.from("profiles").select("status,photo_path,onboarding_completed_at").eq("id", id).single(); if (error || profile?.status !== "active" || profile.photo_path !== path || !profile.onboarding_completed_at) throw new Error("Profile-photo completion contract failed");
    console.log("DEV profile-photo onboarding contract verified.");
  } finally { await admin.storage.from("profile-photos").remove([`profiles/${id}/avatar.avif`]); await admin.from("profiles").delete().eq("id", id); await admin.auth.admin.deleteUser(id); }
}
await main();
