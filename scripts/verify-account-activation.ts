import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-activation-${Date.now()}`;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, message: string) { if (error) throw new Error(`${message}: ${error.message}`); }
function client(url: string, key: string) { return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Activation verification refused: configured project is not approved DEV.");
  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const administrator = client(url, publishableKey);
  fail((await administrator.auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") })).error, "Unable to sign in DEV Admin");
  const { data: campus, error: campusError } = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campusError, "Unable to read active DEV Campus"); if (!campus) throw new Error("Active DEV Campus is required");
  const email = `${prefix}@example.test`; const initialPassword = `Internal-${crypto.randomUUID()}!`; const permanentPassword = `Permanent-${crypto.randomUUID()}!`;
  let invitationId: string | undefined; let userId: string | undefined;
  try {
    const created = await (administrator as unknown as { rpc(name: "create_invitations", args: { payload: Record<string, unknown> }): Promise<{ data: { invitation_ids: string[] } | null; error: { message: string } | null }> }).rpc("create_invitations", { payload: { role: "author", campus_id: campus.id, invitees: [{ email, first_name: "Activation", last_name: "Verify" }] } });
    fail(created.error, "Unable to create activation invitation"); invitationId = created.data?.invitation_ids[0]; if (!invitationId) throw new Error("Activation invitation is missing");
    const auth = await admin.auth.admin.createUser({ email, password: initialPassword, email_confirm: true }); fail(auth.error, "Unable to pre-create activation identity"); userId = auth.data.user?.id; if (!userId) throw new Error("Activation identity is missing");
    fail((await (administrator as unknown as { rpc(name: "record_invitation_auth_identity", args: { target_invitation_id: string; target_auth_user_id: string }): Promise<{ error: { message: string } | null }> }).rpc("record_invitation_auth_identity", { target_invitation_id: invitationId, target_auth_user_id: userId })).error, "Unable to link activation identity");
    const generated = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: new URL("/auth/activate", required("APP_URL")).toString() } });
    fail(generated.error, "Unable to generate one-time activation token");
    const tokenHash = generated.data.properties?.hashed_token; if (!tokenHash) throw new Error("Activation token hash is missing");
    const invitee = client(url, publishableKey); fail((await invitee.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })).error, "Unable to explicitly establish activation session");
    fail((await (invitee as unknown as { rpc(name: "activate_invitation_account", args: Record<string, never>): Promise<{ error: { message: string } | null }> }).rpc("activate_invitation_account", {})).error, "Activation failed");
    const { data: passwordRequired, error: passwordRequiredError } = await admin.from("profiles").select("status").eq("id", userId).single(); fail(passwordRequiredError, "Unable to read password-required state"); if (passwordRequired?.status !== "password_required") throw new Error("Activation did not set password_required");
    fail((await invitee.auth.updateUser({ password: permanentPassword })).error, "Unable to establish permanent password");
    fail((await (invitee as unknown as { rpc(name: "enter_onboarding", args: Record<string, never>): Promise<{ error: { message: string } | null }> }).rpc("enter_onboarding", {})).error, "Unable to enter onboarding");
    const { data: onboarding, error: onboardingError } = await admin.from("profiles").select("status").eq("id", userId).single(); fail(onboardingError, "Unable to read onboarding state"); if (onboarding?.status !== "onboarding") throw new Error("Password establishment did not enter onboarding");
    console.log("DEV deterministic activation, password, and onboarding gate verified without sending email.");
  } finally {
    if (invitationId) await admin.from("audit_events").delete().eq("entity_id", invitationId);
    if (invitationId) await admin.from("invitations").delete().eq("id", invitationId);
    if (userId) { await admin.from("profiles").delete().eq("id", userId); await admin.auth.admin.deleteUser(userId); }
  }
}

await main();
