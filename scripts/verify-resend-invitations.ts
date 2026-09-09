import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-resend-${Date.now()}`;

type CreatedInvitation = { invitation_ids: string[]; group_id: string | null };
type RpcClient = {
  rpc(name: "create_invitations", args: { payload: Record<string, unknown> }): Promise<{ data: CreatedInvitation | null; error: { message: string } | null }>;
  rpc(name: "record_invitation_delivery", args: { target_invitation_id: string; target_auth_user_id: string | null; succeeded: boolean; failure_category: string | null }): Promise<{ error: { message: string } | null }>;
  rpc(name: "record_invitation_resend", args: { target_invitation_id: string }): Promise<{ error: { message: string } | null }>;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Resend verification refused: configured project is not approved DEV.");

  const admin = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const session = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await session.auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") });
  fail(signedIn.error, "Unable to sign in DEV Admin");
  if (!signedIn.data.session || !signedIn.data.user) throw new Error("DEV Admin session is missing");
  const actorProfile = await admin.from("profiles").select("id").eq("id", signedIn.data.user.id).single();
  fail(actorProfile.error, "Unable to read authenticated Admin profile");
  if (!actorProfile.data) throw new Error("Authenticated Admin profile is missing");

  const campusResult = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campusResult.error, "Unable to read active DEV Campus");
  if (!campusResult.data) throw new Error("Active DEV Campus is missing");

  const rpc = session as unknown as RpcClient;
  const invitations: string[] = [];
  let groupId: string | null = null;
  try {
    const created = await rpc.rpc("create_invitations", {
      payload: {
        role: "couple",
        campus_id: campusResult.data.id,
        invitees: [
          { email: `${prefix}-one@example.test`, first_name: "First", last_name: "Resend" },
          { email: `${prefix}-two@example.test`, first_name: "Second", last_name: "Resend" },
        ],
      },
    });
    fail(created.error, "Unable to create resend verification invitations");
    if (!created.data?.group_id || created.data.invitation_ids.length !== 2) throw new Error("Grouped resend verification fixture is incomplete");
    invitations.push(...created.data.invitation_ids);
    groupId = created.data.group_id;

    const [firstId, secondId] = invitations;
    const before = await admin.from("invitations").select("id,group_id,status,resend_count,last_sent_at,last_delivery_attempt_at,delivery_attempt_count").in("id", invitations).order("email");
    fail(before.error, "Unable to read resend verification fixture");
    if (before.data?.length !== 2 || before.data.some((item) => item.group_id !== groupId || item.status !== "pending" || item.resend_count !== 0)) throw new Error("Resend verification fixture has an invalid initial state");

    const failedDelivery = await rpc.rpc("record_invitation_delivery", { target_invitation_id: firstId, target_auth_user_id: null, succeeded: false, failure_category: "provider_unavailable" });
    fail(failedDelivery.error, "Unable to record deterministic provider failure");
    const failedRow = await admin.from("invitations").select("status,resend_count,last_delivery_attempt_at,delivery_error_category").eq("id", firstId).single();
    fail(failedRow.error, "Unable to read provider failure state");
    if (failedRow.data?.status !== "pending" || failedRow.data.resend_count !== 0 || !failedRow.data.last_delivery_attempt_at || failedRow.data.delivery_error_category !== "provider_unavailable") throw new Error("Provider failure changed invitation state incorrectly");
    const failedAudit = await admin.from("audit_events").select("id", { count: "exact", head: true }).eq("entity_id", firstId).eq("event_type", "invitation.resent");
    fail(failedAudit.error, "Unable to check provider-failure audit state");
    if (failedAudit.count !== 0) throw new Error("Provider failure wrote a false resend audit event");

    const resent = await rpc.rpc("record_invitation_resend", { target_invitation_id: firstId });
    fail(resent.error, "Unable to record successful resend");
    const [firstAfter, secondAfter, resendAudit, invitationCount, groupCount] = await Promise.all([
      admin.from("invitations").select("id,group_id,status,resend_count,last_sent_at,last_delivery_attempt_at,delivery_attempt_count").eq("id", firstId).single(),
      admin.from("invitations").select("id,group_id,status,resend_count,last_sent_at,last_delivery_attempt_at,delivery_attempt_count").eq("id", secondId).single(),
      admin.from("audit_events").select("actor_id,event_type,entity_id").eq("entity_id", firstId).eq("event_type", "invitation.resent").single(),
      admin.from("invitations").select("id", { count: "exact", head: true }).in("id", invitations),
      admin.from("groups").select("id", { count: "exact", head: true }).eq("id", groupId),
    ]);
    fail(firstAfter.error, "Unable to read resent invitation");
    fail(secondAfter.error, "Unable to read untouched grouped invitation");
    fail(resendAudit.error, "Unable to read resend audit event");
    fail(invitationCount.error, "Unable to count resend invitations");
    fail(groupCount.error, "Unable to count resend group");
    if (!resendAudit.data) throw new Error("Resend audit event is missing");
    if (firstAfter.data?.id !== firstId || firstAfter.data.group_id !== groupId || firstAfter.data.status !== "pending" || firstAfter.data.resend_count !== 1 || !firstAfter.data.last_sent_at || !firstAfter.data.last_delivery_attempt_at || firstAfter.data.delivery_attempt_count !== 1) throw new Error("Successful resend did not update only the expected invitation metadata");
    if (secondAfter.data?.id !== secondId || secondAfter.data.group_id !== groupId || secondAfter.data.status !== "pending" || secondAfter.data.resend_count !== 0 || secondAfter.data.last_sent_at !== null || secondAfter.data.delivery_attempt_count !== 0) throw new Error("Resending one grouped invite altered the other member");
    if (resendAudit.data.actor_id !== actorProfile.data.id || resendAudit.data.entity_id !== firstId) throw new Error("Resend audit actor does not match the authenticated Admin profile");
    if (invitationCount.count !== 2 || groupCount.count !== 1) throw new Error("Resend created a duplicate invitation or group");
    console.log("DEV resend persistence, audit actor, grouped isolation, and provider-failure behavior verified without sending email.");
  } finally {
    if (invitations.length) {
      await admin.from("audit_events").delete().in("entity_id", invitations);
      await admin.from("invitations").delete().in("id", invitations);
    }
    if (groupId) await admin.from("groups").delete().eq("id", groupId);
  }
}

await main();
