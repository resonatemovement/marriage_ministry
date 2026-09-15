import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-setup-recovery-${Date.now()}`;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, message: string) { if (error) throw new Error(`${message}: ${error.message}`); }
function client(url: string, key: string) { return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Setup recovery verification refused outside approved DEV.");
  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const staff = client(url, publishableKey);
  fail((await staff.auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") })).error, "Unable to sign in DEV Admin");
  const { data: campus, error: campusError } = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campusError, "Unable to read active DEV Campus"); if (!campus) throw new Error("Active DEV Campus is required");

  const people = [
    { email: `${prefix}-one@example.test`, first_name: "Setup", last_name: "Active", phone: "+15555550101" },
    { email: `${prefix}-two@example.test`, first_name: "Setup", last_name: "Recover", phone: "+15555550102" },
  ];
  const invitationIds: string[] = []; const userIds: string[] = []; let groupId = "";
  try {
    const created = await (staff as unknown as { rpc(name: "create_invitations", args: { payload: Record<string, unknown> }): Promise<{ data: { invitation_ids: string[]; group_id: string } | null; error: { message: string } | null }> }).rpc("create_invitations", { payload: { role: "couple", campus_id: campus.id, invitees: people } });
    fail(created.error, "Unable to create Couple invitations"); if (!created.data) throw new Error("Couple invitation response is missing");
    invitationIds.push(...created.data.invitation_ids); groupId = created.data.group_id;
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index]!;
      const auth = await admin.auth.admin.createUser({ email: person.email, password: `Internal-${crypto.randomUUID()}!`, email_confirm: true });
      fail(auth.error, "Unable to create controlled Auth identity"); const userId = auth.data.user?.id; if (!userId) throw new Error("Auth identity is missing"); userIds.push(userId);
      fail((await (staff as unknown as { rpc(name: "record_invitation_auth_identity", args: { target_invitation_id: string; target_auth_user_id: string }): Promise<{ error: { message: string } | null }> }).rpc("record_invitation_auth_identity", { target_invitation_id: invitationIds[index]!, target_auth_user_id: userId })).error, "Unable to link invitation identity");
      const link = await admin.auth.admin.generateLink({ type: "recovery", email: person.email, options: { redirectTo: new URL("/auth/activate", required("APP_URL")).toString() } });
      const token = link.data.properties?.hashed_token; if (!token) throw new Error("Activation token is missing");
      const invitee = client(url, publishableKey);
      fail((await invitee.auth.verifyOtp({ token_hash: token, type: "recovery" })).error, "Unable to establish activation session");
      fail((await (invitee as unknown as { rpc(name: "activate_invitation_account", args: Record<string, never>): Promise<{ error: { message: string } | null }> }).rpc("activate_invitation_account", {})).error, "Unable to activate invitation");
      if (index === 0) {
        const password = `Permanent-${crypto.randomUUID()}!`;
        fail((await invitee.auth.updateUser({ password })).error, "Unable to establish first partner password");
        fail((await (invitee as unknown as { rpc(name: "enter_onboarding", args: Record<string, never>): Promise<{ error: { message: string } | null }> }).rpc("enter_onboarding", {})).error, "Unable to enter onboarding");
        fail((await client(url, publishableKey).auth.signInWithPassword({ email: person.email, password })).error, "Normal password login failed");
      } else {
        const denied = await (invitee as unknown as { rpc(name: "record_invitation_setup_resend", args: { target_invitation_id: string }): Promise<{ error: { message: string } | null }> }).rpc("record_invitation_setup_resend", { target_invitation_id: invitationIds[index]! });
        if (!denied.error?.message.includes("Only Admin or Super Admin")) throw new Error("Ordinary member could resend account setup");
      }
    }
    const before = await admin.from("invitations").select("id,auth_user_id,status,resend_count").in("id", invitationIds).order("email"); fail(before.error, "Unable to read invitations before setup resend");
    fail((await (staff as unknown as { rpc(name: "record_invitation_setup_resend", args: { target_invitation_id: string }): Promise<{ error: { message: string } | null }> }).rpc("record_invitation_setup_resend", { target_invitation_id: invitationIds[1]! })).error, "Admin setup resend record failed");
    const after = await admin.from("invitations").select("id,auth_user_id,status,resend_count").in("id", invitationIds).order("email"); fail(after.error, "Unable to read invitations after setup resend");
    if (after.data?.[1]?.auth_user_id !== before.data?.[1]?.auth_user_id || after.data?.[1]?.status !== "accepted" || after.data?.[1]?.resend_count !== (before.data?.[1]?.resend_count ?? 0) + 1) throw new Error("Setup resend changed the invitation identity or state");
    const memberships = await admin.from("group_members").select("profile_id").eq("group_id", groupId).is("ended_at", null); fail(memberships.error, "Unable to read Couple memberships"); if (memberships.data?.length !== 2) throw new Error("Setup resend changed Couple membership");
    const second = people[1]!; const fresh = await admin.auth.admin.generateLink({ type: "recovery", email: second.email, options: { redirectTo: new URL("/auth/activate", required("APP_URL")).toString() } }); const freshToken = fresh.data.properties?.hashed_token; if (!freshToken) throw new Error("Fresh setup token is missing");
    const recovered = client(url, publishableKey); fail((await recovered.auth.verifyOtp({ token_hash: freshToken, type: "recovery" })).error, "Fresh setup link did not establish a session"); fail((await (recovered as unknown as { rpc(name: "activate_invitation_account", args: Record<string, never>): Promise<{ error: { message: string } | null }> }).rpc("activate_invitation_account", {})).error, "Fresh setup link did not return to password setup");
    const recoveredPassword = `Recovered-${crypto.randomUUID()}!`; fail((await recovered.auth.updateUser({ password: recoveredPassword })).error, "Recovered password was not saved"); fail((await (recovered as unknown as { rpc(name: "enter_onboarding", args: Record<string, never>): Promise<{ error: { message: string } | null }> }).rpc("enter_onboarding", {})).error, "Recovered account did not enter onboarding"); fail((await client(url, publishableKey).auth.signInWithPassword({ email: second.email, password: recoveredPassword })).error, "Recovered normal login failed");
    console.log("DEV setup resend preserved the existing Couple, profiles, memberships, and identities; fresh setup established password login.");
  } finally {
    if (invitationIds.length) await admin.from("audit_events").delete().in("entity_id", [...invitationIds, ...userIds]);
    if (userIds.length) await admin.from("group_members").delete().in("profile_id", userIds);
    if (invitationIds.length) await admin.from("invitations").delete().in("id", invitationIds);
    if (userIds.length) await admin.from("profiles").delete().in("id", userIds);
    if (groupId) await admin.from("groups").delete().eq("id", groupId);
    for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  }
}

await main();
