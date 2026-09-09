import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-acceptance-${Date.now()}`;

type Invitee = { email: string; first_name: string; last_name: string };
type CreatedInvitation = { invitation_ids: string[]; group_id: string | null };

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
  fail(error, "Unable to sign in acceptance verification user");
  if (!data.session) throw new Error("Acceptance verification session is missing");
  return signedIn;
}

async function createAuthUser(admin: ReturnType<typeof client>, email: string, password: string, createdUsers: string[]) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  fail(error, "Unable to create acceptance verification Auth user");
  if (!data.user) throw new Error("Acceptance verification Auth user is missing");
  createdUsers.push(data.user.id);
  return data.user.id;
}

async function createInvitation(
  adminSession: ReturnType<typeof client>,
  role: string,
  campusId: string,
  invitees: Invitee[],
) {
  const { data, error } = await (adminSession as unknown as {
    rpc(name: "create_invitations", args: { payload: Record<string, unknown> }): Promise<{ data: CreatedInvitation | null; error: { message: string } | null }>;
  }).rpc("create_invitations", { payload: { role, campus_id: campusId, invitees } });
  fail(error, "Unable to create acceptance verification invitation");
  if (!data) throw new Error("Acceptance verification invitation response is missing");
  return data;
}

async function recordDelivery(
  adminSession: ReturnType<typeof client>,
  invitationId: string,
  authUserId: string,
) {
  const { error } = await (adminSession as unknown as {
    rpc(name: "record_invitation_delivery", args: { target_invitation_id: string; target_auth_user_id: string; succeeded: boolean; failure_category: null }): Promise<{ error: { message: string } | null }>;
  }).rpc("record_invitation_delivery", {
    target_invitation_id: invitationId,
    target_auth_user_id: authUserId,
    succeeded: true,
    failure_category: null,
  });
  fail(error, "Unable to record acceptance verification delivery");
}

async function accept(invitee: ReturnType<typeof client>) {
  return (invitee as unknown as {
    rpc(name: "accept_invitation", args: Record<string, never>): Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc("accept_invitation", {});
}

async function accountState(admin: ReturnType<typeof client>, profileId: string) {
  const [profileResult, rolesResult, membershipsResult] = await Promise.all([
    admin.from("profiles").select("id,status,first_name,last_name,email,campus_id,deactivated_at").eq("id", profileId).maybeSingle(),
    admin.from("profile_roles").select("role").eq("profile_id", profileId).order("role"),
    admin.from("group_members").select("group_id,ended_at").eq("profile_id", profileId).order("group_id"),
  ]);
  fail(profileResult.error, "Unable to read acceptance verification profile state");
  fail(rolesResult.error, "Unable to read acceptance verification role state");
  fail(membershipsResult.error, "Unable to read acceptance verification membership state");
  return JSON.stringify({ profile: profileResult.data, roles: rolesResult.data, memberships: membershipsResult.data });
}

async function assertPendingWithoutAcceptanceAudit(admin: ReturnType<typeof client>, invitationId: string, label: string) {
  const [{ data: invitation, error: invitationError }, { count, error: auditError }] = await Promise.all([
    admin.from("invitations").select("status,accepted_at").eq("id", invitationId).single(),
    admin.from("audit_events").select("id", { count: "exact", head: true }).eq("entity_id", invitationId).eq("event_type", "invitation.accepted"),
  ]);
  fail(invitationError, `Unable to read ${label} invitation`);
  fail(auditError, `Unable to read ${label} invitation audit`);
  if (invitation?.status !== "pending" || invitation.accepted_at !== null || count !== 0) {
    throw new Error(`${label} acceptance changed the authoritative invitation state`);
  }
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("Invitation acceptance verification refused: configured project is not approved DEV.");
  }

  const admin = client(url, required("SUPABASE_SECRET_KEY"));
  const adminSession = await signIn(url, publishableKey, required("TEST_ADMIN_EMAIL").toLowerCase(), required("TEST_ADMIN_PASSWORD"));
  const { data: campus, error: campusError } = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campusError, "Unable to read an active DEV Campus");
  if (!campus) throw new Error("An active DEV Campus is required");

  const createdUsers: string[] = [];
  const invitations: string[] = [];
  const groups: string[] = [];
  try {
    const password = `Verify-${crypto.randomUUID()}!`;
    const standaloneEmail = `${prefix}-author@example.test`;
    const standalone = await createInvitation(adminSession, "author", campus.id, [{ email: standaloneEmail, first_name: "Standalone", last_name: "Author" }]);
    invitations.push(...standalone.invitation_ids);
    const standaloneUser = await createAuthUser(admin, standaloneEmail, password, createdUsers);
    await recordDelivery(adminSession, standalone.invitation_ids[0]!, standaloneUser);
    const standaloneSession = await signIn(url, publishableKey, standaloneEmail, password);
    const standaloneAcceptance = await accept(standaloneSession);
    fail(standaloneAcceptance.error, "Standalone invitation acceptance failed");
    const { data: standaloneRecord, error: standaloneError } = await admin
      .from("invitations")
      .select("status,auth_user_id,accepted_at")
      .eq("id", standalone.invitation_ids[0]!)
      .single();
    fail(standaloneError, "Unable to read accepted standalone invitation");
    const { data: standaloneProfile, error: standaloneProfileError } = await admin
      .from("profiles")
      .select("status")
      .eq("id", standaloneUser)
      .single();
    fail(standaloneProfileError, "Unable to read established standalone profile");
    const { data: standaloneRoles, error: standaloneRolesError } = await admin
      .from("profile_roles")
      .select("role")
      .eq("profile_id", standaloneUser)
      .eq("role", "author");
    fail(standaloneRolesError, "Unable to read established standalone role");
    if (standaloneRecord?.status !== "accepted" || standaloneRecord.auth_user_id !== standaloneUser || !standaloneRecord.accepted_at || standaloneProfile?.status !== "invited" || standaloneRoles?.length !== 1) {
      throw new Error("Standalone acceptance did not establish the expected gated account state");
    }
    const standaloneRetry = await accept(standaloneSession);
    fail(standaloneRetry.error, "Standalone idempotent retry failed");
    const { count: acceptanceAuditCount, error: auditError } = await admin
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", standalone.invitation_ids[0]!)
      .eq("event_type", "invitation.accepted");
    fail(auditError, "Unable to verify standalone acceptance audit");
    if (acceptanceAuditCount !== 1) throw new Error("Standalone acceptance retry duplicated its audit event");

    const firstEmail = `${prefix}-couple-1@example.test`;
    const secondEmail = `${prefix}-couple-2@example.test`;
    const grouped = await createInvitation(adminSession, "couple", campus.id, [
      { email: firstEmail, first_name: "First", last_name: "Partner" },
      { email: secondEmail, first_name: "Second", last_name: "Partner" },
    ]);
    invitations.push(...grouped.invitation_ids);
    if (!grouped.group_id) throw new Error("Grouped acceptance invitation did not create a group");
    groups.push(grouped.group_id);
    const firstUser = await createAuthUser(admin, firstEmail, password, createdUsers);
    const secondUser = await createAuthUser(admin, secondEmail, password, createdUsers);
    await recordDelivery(adminSession, grouped.invitation_ids[0]!, firstUser);
    await recordDelivery(adminSession, grouped.invitation_ids[1]!, secondUser);
    const { data: secondProfileBefore, error: secondProfileBeforeError } = await admin
      .from("profiles")
      .select("id,status,first_name,last_name,email,campus_id")
      .eq("id", secondUser)
      .maybeSingle();
    fail(secondProfileBeforeError, "Unable to read second grouped profile before acceptance");
    const { data: secondRolesBefore, error: secondRolesBeforeError } = await admin
      .from("profile_roles")
      .select("role")
      .eq("profile_id", secondUser);
    fail(secondRolesBeforeError, "Unable to read second grouped roles before acceptance");
    const { data: secondMembershipsBefore, error: secondMembershipsBeforeError } = await admin
      .from("group_members")
      .select("group_id")
      .eq("profile_id", secondUser)
      .is("ended_at", null);
    fail(secondMembershipsBeforeError, "Unable to read second grouped memberships before acceptance");
    const firstSession = await signIn(url, publishableKey, firstEmail, password);
    fail((await accept(firstSession)).error, "First grouped invitation acceptance failed");
    const { data: groupedRows, error: groupedRowsError } = await admin
      .from("invitations")
      .select("id,status,auth_user_id")
      .in("id", grouped.invitation_ids);
    fail(groupedRowsError, "Unable to read grouped invitation state");
    if (groupedRows?.find((row) => row.id === grouped.invitation_ids[0])?.status !== "accepted" || groupedRows?.find((row) => row.id === grouped.invitation_ids[1])?.status !== "pending") {
      throw new Error("Grouped acceptance did not preserve the second pending invitation");
    }
    const { data: firstMemberships, error: firstMembershipError } = await admin.from("group_members").select("group_id").eq("profile_id", firstUser).is("ended_at", null);
    fail(firstMembershipError, "Unable to read first grouped membership");
    const { data: secondProfileAfter, error: secondProfileAfterError } = await admin
      .from("profiles")
      .select("id,status,first_name,last_name,email,campus_id")
      .eq("id", secondUser)
      .maybeSingle();
    fail(secondProfileAfterError, "Unable to read second grouped profile after acceptance");
    const { data: secondRolesAfter, error: secondRolesAfterError } = await admin
      .from("profile_roles")
      .select("role")
      .eq("profile_id", secondUser);
    fail(secondRolesAfterError, "Unable to read second grouped roles after acceptance");
    const { data: secondMembershipsAfter, error: secondMembershipsAfterError } = await admin
      .from("group_members")
      .select("group_id")
      .eq("profile_id", secondUser)
      .is("ended_at", null);
    fail(secondMembershipsAfterError, "Unable to read second grouped memberships after acceptance");
    if (
      firstMemberships?.length !== 1
      || firstMemberships[0]?.group_id !== grouped.group_id
      || JSON.stringify(secondProfileAfter) !== JSON.stringify(secondProfileBefore)
      || JSON.stringify(secondRolesAfter) !== JSON.stringify(secondRolesBefore)
      || JSON.stringify(secondMembershipsAfter) !== JSON.stringify(secondMembershipsBefore)
    ) throw new Error("Grouped acceptance changed more than the accepting person");
    fail((await accept(firstSession)).error, "Grouped idempotent retry failed");
    const secondSession = await signIn(url, publishableKey, secondEmail, password);
    fail((await accept(secondSession)).error, "Second grouped invitation acceptance failed");
    const { data: memberships, error: membershipError } = await admin.from("group_members").select("profile_id").eq("group_id", grouped.group_id).is("ended_at", null);
    fail(membershipError, "Unable to verify grouped memberships");
    if (memberships?.length !== 2 || !memberships.some((membership) => membership.profile_id === firstUser) || !memberships.some((membership) => membership.profile_id === secondUser)) {
      throw new Error("Grouped acceptance did not establish exactly two memberships");
    }

    const rejectedEmail = `${prefix}-revoked@example.test`;
    const revoked = await createInvitation(adminSession, "author", campus.id, [{ email: rejectedEmail, first_name: "Revoked", last_name: "Invite" }]);
    invitations.push(...revoked.invitation_ids);
    const rejectedUser = await createAuthUser(admin, rejectedEmail, password, createdUsers);
    await recordDelivery(adminSession, revoked.invitation_ids[0]!, rejectedUser);
    fail((await admin.from("invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", revoked.invitation_ids[0]!)).error, "Unable to revoke acceptance verification invitation");
    if (!(await accept(await signIn(url, publishableKey, rejectedEmail, password))).error?.message.toLowerCase().includes("revoked")) throw new Error("Revoked invitation was not rejected");

    const expiredEmail = `${prefix}-expired@example.test`;
    const expired = await createInvitation(adminSession, "author", campus.id, [{ email: expiredEmail, first_name: "Expired", last_name: "Invite" }]);
    invitations.push(...expired.invitation_ids);
    const expiredUser = await createAuthUser(admin, expiredEmail, password, createdUsers);
    await recordDelivery(adminSession, expired.invitation_ids[0]!, expiredUser);
    fail((await admin.from("invitations").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", expired.invitation_ids[0]!)).error, "Unable to expire acceptance verification invitation");
    if (!(await accept(await signIn(url, publishableKey, expiredEmail, password))).error?.message.toLowerCase().includes("expired")) throw new Error("Expired invitation was not rejected");

    const mismatchEmail = `${prefix}-identity@example.test`;
    const mismatch = await createInvitation(adminSession, "author", campus.id, [{ email: mismatchEmail, first_name: "Expected", last_name: "Identity" }]);
    invitations.push(...mismatch.invitation_ids);
    const wrongUser = await createAuthUser(admin, `${prefix}-wrong@example.test`, password, createdUsers);
    await recordDelivery(adminSession, mismatch.invitation_ids[0]!, wrongUser);
    const wrongStateBefore = await accountState(admin, wrongUser);
    const mismatchResult = await accept(await signIn(url, publishableKey, `${prefix}-wrong@example.test`, password));
    if (!mismatchResult.error?.message.toLowerCase().includes("email does not match")) throw new Error("Identity-mismatched invitation was not rejected by the acceptance RPC");
    if (await accountState(admin, wrongUser) !== wrongStateBefore) throw new Error("Identity-mismatched acceptance modified the wrong account");
    await assertPendingWithoutAcceptanceAudit(admin, mismatch.invitation_ids[0]!, "Identity-mismatched");

    const invalidEmail = `${prefix}-invalid-group@example.test`;
    const invalidGrouped = await createInvitation(adminSession, "coach", campus.id, [
      { email: invalidEmail, first_name: "Invalid", last_name: "Group" },
      { email: `${prefix}-invalid-group-partner@example.test`, first_name: "Unused", last_name: "Partner" },
    ]);
    invitations.push(...invalidGrouped.invitation_ids);
    if (!invalidGrouped.group_id) throw new Error("Invalid-group verification invitation did not create a group");
    groups.push(invalidGrouped.group_id);
    const invalidUser = await createAuthUser(admin, invalidEmail, password, createdUsers);
    const invalidPartner = await createAuthUser(admin, `${prefix}-invalid-group-partner@example.test`, password, createdUsers);
    await recordDelivery(adminSession, invalidGrouped.invitation_ids[0]!, invalidUser);
    await recordDelivery(adminSession, invalidGrouped.invitation_ids[1]!, invalidPartner);
    fail((await admin.from("groups").update({ active: false }).eq("id", invalidGrouped.group_id)).error, "Unable to invalidate grouped acceptance fixture");
    const invalidStateBefore = await accountState(admin, invalidUser);
    const invalidResult = await accept(await signIn(url, publishableKey, invalidEmail, password));
    if (!invalidResult.error?.message.toLowerCase().includes("group is invalid")) throw new Error("Invalid grouped invitation was not rejected by the acceptance RPC");
    if (await accountState(admin, invalidUser) !== invalidStateBefore) throw new Error("Invalid grouped acceptance left partial account state");
    await assertPendingWithoutAcceptanceAudit(admin, invalidGrouped.invitation_ids[0]!, "Invalid-group");
    const { count: invalidGroupCount, error: invalidGroupCountError } = await admin.from("groups").select("id", { count: "exact", head: true }).eq("id", invalidGrouped.group_id);
    fail(invalidGroupCountError, "Unable to verify invalid grouped fixture");
    if (invalidGroupCount !== 1) throw new Error("Invalid grouped acceptance created or replaced a group");

    const rollbackEmail = `${prefix}-rollback@example.test`;
    const rollback = await createInvitation(adminSession, "author", campus.id, [{ email: rollbackEmail, first_name: "Rollback", last_name: "Check" }]);
    invitations.push(...rollback.invitation_ids);
    const rollbackUser = await createAuthUser(admin, rollbackEmail, password, createdUsers);
    await recordDelivery(adminSession, rollback.invitation_ids[0]!, rollbackUser);
    fail((await admin.from("profiles").upsert({ id: rollbackUser, campus_id: campus.id, first_name: "Existing", last_name: "Deactivated", email: rollbackEmail, status: "deactivated", deactivated_at: new Date().toISOString() }, { onConflict: "id" })).error, "Unable to create rollback verification profile");
    const rollbackStateBefore = await accountState(admin, rollbackUser);
    const rollbackResult = await accept(await signIn(url, publishableKey, rollbackEmail, password));
    if (!rollbackResult.error) throw new Error("Forced acceptance transaction failure unexpectedly succeeded");
    if (await accountState(admin, rollbackUser) !== rollbackStateBefore) throw new Error("Forced acceptance failure left partial account state");
    await assertPendingWithoutAcceptanceAudit(admin, rollback.invitation_ids[0]!, "Forced rollback");
    fail((await admin.from("profiles").update({ status: "invited", deactivated_at: null }).eq("id", rollbackUser)).error, "Unable to correct rollback verification profile");
    fail((await accept(await signIn(url, publishableKey, rollbackEmail, password))).error, "Acceptance retry did not succeed after correcting the rollback fixture");

    console.log("DEV invitation acceptance lifecycle verified.");
  } finally {
    if (invitations.length) await admin.from("invitations").delete().in("id", invitations);
    if (groups.length) await admin.from("groups").delete().in("id", groups);
    if (createdUsers.length) {
      await admin.from("profiles").delete().in("id", createdUsers);
      for (const userId of createdUsers) await admin.auth.admin.deleteUser(userId);
    }
  }
}

await main();
