import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-onboarding-${Date.now()}`;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function client(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signIn(url: string, publishableKey: string, email: string, password: string) {
  const signedIn = client(url, publishableKey);
  const { data, error } = await signedIn.auth.signInWithPassword({ email, password });
  fail(error, "Unable to sign in onboarding verification user");
  if (!data.session) throw new Error("Onboarding verification session is missing");
  return signedIn;
}

async function save(clientForUser: ReturnType<typeof client>, firstName: string, lastName: string, phone: string) {
  return (clientForUser as unknown as {
    rpc(name: "save_onboarding_profile", args: { target_first_name: string; target_last_name: string; target_phone: string }): Promise<{ error: { message: string } | null }>;
  }).rpc("save_onboarding_profile", { target_first_name: firstName, target_last_name: lastName, target_phone: phone });
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Onboarding verification refused: configured project is not approved DEV.");

  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const { data: campus, error: campusError } = await admin.from("campuses").select("id,name").eq("active", true).limit(1).single();
  fail(campusError, "Unable to read an active DEV Campus");
  if (!campus) throw new Error("An active DEV Campus is required");

  const email = `${prefix}@example.test`;
  const otherEmail = `${prefix}-other@example.test`;
  const password = `Verify-${crypto.randomUUID()}!`;
  const createdUsers: string[] = [];
  try {
    const { data: user, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    fail(userError, "Unable to create onboarding verification user");
    if (!user.user) throw new Error("Onboarding verification user is missing");
    createdUsers.push(user.user.id);
    const { data: otherUser, error: otherUserError } = await admin.auth.admin.createUser({ email: otherEmail, password, email_confirm: true });
    fail(otherUserError, "Unable to create secondary onboarding verification user");
    if (!otherUser.user) throw new Error("Secondary onboarding verification user is missing");
    createdUsers.push(otherUser.user.id);
    fail((await admin.from("profiles").upsert({ id: user.user.id, campus_id: campus.id, first_name: "", last_name: "", email, phone: null, status: "onboarding", deactivated_at: null }, { onConflict: "id" })).error, "Unable to prepare onboarding profile");
    fail((await admin.from("profiles").upsert({ id: otherUser.user.id, campus_id: campus.id, first_name: "Other", last_name: "User", email: otherEmail, phone: null, status: "onboarding", deactivated_at: null }, { onConflict: "id" })).error, "Unable to prepare secondary onboarding profile");

    const invitee = await signIn(url, publishableKey, email, password);
    fail((await save(invitee, "  Jordan  ", "  Smith ", "+1 (555) 123-4567")).error, "Unable to save onboarding progress");
    const { data: savedProfile, error: savedProfileError } = await admin.from("profiles").select("first_name,last_name,phone,email,campus_id,status").eq("id", user.user.id).single();
    fail(savedProfileError, "Unable to read saved onboarding profile");
    if (savedProfile?.first_name !== "Jordan" || savedProfile.last_name !== "Smith" || savedProfile.phone !== "+15551234567" || savedProfile.email !== email || savedProfile.campus_id !== campus.id || savedProfile.status !== "onboarding") {
      throw new Error("Onboarding progress was not persisted with authoritative read-only values preserved");
    }
    fail((await save(invitee, "Jordan", "Walker", "+1 (555) 123-4567")).error, "Unable to resume onboarding progress");
    const { data: resumedProfile, error: resumedProfileError } = await admin.from("profiles").select("last_name,status").eq("id", user.user.id).single();
    fail(resumedProfileError, "Unable to read resumed onboarding profile");
    if (resumedProfile?.last_name !== "Walker" || resumedProfile.status !== "onboarding") throw new Error("Onboarding resume did not persist or incorrectly activated the account");

    const other = await signIn(url, publishableKey, otherEmail, password);
    await other.from("profiles").update({ first_name: "Unauthorized" }).eq("id", user.user.id);
    const { data: protectedProfile, error: protectedProfileError } = await admin.from("profiles").select("first_name,email,campus_id").eq("id", user.user.id).single();
    fail(protectedProfileError, "Unable to verify protected onboarding profile");
    if (protectedProfile?.first_name !== "Jordan" || protectedProfile.email !== email || protectedProfile.campus_id !== campus.id) throw new Error("Incomplete user unexpectedly updated another onboarding profile");
    const { data: roles, error: rolesError } = await admin.from("profile_roles").select("role").eq("profile_id", user.user.id);
    fail(rolesError, "Unable to read onboarding verification roles");
    const { data: memberships, error: membershipsError } = await admin.from("group_members").select("id").eq("profile_id", user.user.id);
    fail(membershipsError, "Unable to read onboarding verification memberships");
    if (roles?.length || memberships?.length) throw new Error("Onboarding changed roles or group memberships");

    const adminUser = await signIn(url, publishableKey, required("TEST_ADMIN_EMAIL").toLowerCase(), required("TEST_ADMIN_PASSWORD"));
    const { data: activeProfile, error: activeProfileError } = await adminUser.from("profiles").select("status").eq("email", required("TEST_ADMIN_EMAIL").toLowerCase()).single();
    fail(activeProfileError, "Unable to verify existing active user");
    if (activeProfile?.status !== "active") throw new Error("Existing active user behavior changed");
    console.log("DEV onboarding profile progress and workspace gate verified.");
  } finally {
    if (createdUsers.length) {
      await admin.from("profiles").delete().in("id", createdUsers);
      for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId);
    }
  }
}

await main();
