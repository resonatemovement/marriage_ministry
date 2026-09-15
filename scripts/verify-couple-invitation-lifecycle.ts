import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-couple-invite-${Date.now()}`;
const people = [
  { email: `${prefix}-one@example.test`, first_name: "Verifier", last_name: "One", phone: "+15555551212" },
  { email: `${prefix}-two@example.test`, first_name: "Verifier", last_name: "Two", phone: "+15555551213" },
] as const;
type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: { invitation_ids: string[]; group_id: string } | null; error: { message: string } | null }> };
type InvitationRow = { id: string; email: string; phone: string | null; group_id: string | null };
type ProfileRow = { id: string; email: string | null; phone: string | null; campus_id: string | null; status: string; onboarding_completed_at?: string | null; photo_path?: string | null };
type DatabaseError = { code?: string; message?: string; details?: string; hint?: string };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function errorDetails(error: DatabaseError | null) { return [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" | ") || "unspecified database error"; }
function cleanupFailure(label: string, ids: string[], error: DatabaseError | null) { if (error) throw new Error(`Cleanup ${label} ids=${ids.join(",")} error=${errorDetails(error)}`); }

async function recoverAndClean(runId: string) {
  if (!/^verify-couple-invite-\d+$/.test(runId)) throw new Error("An exact Couple verifier run ID is required");
  const { url } = getSupabaseEnvironment(); if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Refusing outside DEV");
  const admin = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const emails = [`${runId}-one@example.test`, `${runId}-two@example.test`];
  const [invitations, profiles, auth] = await Promise.all([
    admin.from("invitations").select("id,email,group_id").in("email", emails),
    admin.from("profiles").select("id,email").in("email", emails),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  fail(invitations.error, "Recover invitations"); fail(profiles.error, "Recover profiles"); fail(auth.error, "Recover Auth identities");
  const invitationRows = invitations.data ?? [], profileRows = profiles.data ?? [];
  const invitationIds = invitationRows.map((row) => row.id);
  const authIds = (auth.data.users ?? []).filter((user) => user.email && emails.includes(user.email)).map((user) => user.id);
  if (authIds.length !== 2) throw new Error(`Recovered Auth identities are incomplete or ambiguous: ${authIds.length}`);
  const profileIds = profileRows.map((row) => row.id);
  if (profileIds.length && (profileIds.length !== 2 || profileIds.some((id) => !authIds.includes(id)))) throw new Error(`Recovered profiles are incomplete or ambiguous: ${profileIds.length}`);
  const userIds = profileIds.length ? profileIds : authIds;
  const memberships = await admin.from("group_members").select("id,group_id,profile_id").in("profile_id", userIds); fail(memberships.error, "Recover memberships");
  const linkedGroupIds = [...new Set([...invitationRows.map((row) => row.group_id), ...(memberships.data ?? []).map((row) => row.group_id)].filter((id): id is string => Boolean(id)))];
  const startedAt = new Date(Number(runId.replace("verify-couple-invite-", "")));
  const groupCandidates = linkedGroupIds.length ? { data: linkedGroupIds.map((id) => ({ id })), error: null } : await admin.from("groups").select("id,created_at").eq("group_type", "couple").eq("name", "Pending Couple invitation").gte("created_at", startedAt.toISOString()).lt("created_at", new Date(startedAt.getTime() + 60_000).toISOString());
  fail(groupCandidates.error, "Recover Couple group");
  const groupIds = [...new Set((groupCandidates.data ?? []).map((row) => row.id))];
  if (groupIds.length > 1) throw new Error(`Recovered Couple group is ambiguous: ${groupIds.length} exact-run candidates`);
  const groupId = groupIds[0] ?? null;
  const audit = await admin.from("audit_events").select("id,entity_id,event_type").or(`entity_id.in.(${userIds.join(",")})${invitationIds.length ? `,entity_id.in.(${invitationIds.join(",")})` : ""}`); fail(audit.error, "Recover audit rows");
  console.log(`Recovered artifacts: Auth=${authIds.length}; profiles=${profileIds.length}; invitations=${invitationIds.length}; Couple group=${groupId ? 1 : 0}; memberships=${memberships.data?.length ?? 0}; audit=${audit.data?.length ?? 0}`);
  if (!groupId) throw new Error("Recovered Couple group is missing; refusing ambiguous cleanup");
  console.log("Cleanup ownership preflight: passed");
  const dependencyCounts = await Promise.all([admin.from("counseling_cases").select("id", { count: "exact", head: true }).eq("couple_group_id", groupId), admin.from("case_assignments").select("id", { count: "exact", head: true }).eq("assigned_group_id", groupId)]);
  const dependencyRows = await Promise.all([admin.from("supervision_assignments").select("id").eq("coach_group_id", groupId).limit(10), admin.from("supervision_assignments").select("id").eq("counselor_group_id", groupId).limit(10), admin.from("campus_lead_coach_assignments").select("id").eq("campus_lead_group_id", groupId).limit(10), admin.from("campus_lead_coach_assignments").select("id").eq("coach_group_id", groupId).limit(10)]);
  const deps = [...dependencyCounts.map((result) => ({ error: result.error, matches: result.count ?? 0 })), ...dependencyRows.map((result) => ({ error: result.error, matches: result.data?.length ?? 0 }))];
  const names = ["counseling_cases.couple_group_id", "case_assignments.assigned_group_id", "supervision_assignments.coach_group_id", "supervision_assignments.counselor_group_id", "campus_lead_coach_assignments.campus_lead_group_id", "campus_lead_coach_assignments.coach_group_id"];
  deps.forEach((result, index) => { const classification = result.error ? "QUERY_ERROR" : result.matches ? "REAL_DEPENDENCY" : "PASS_ZERO_MATCHES"; const error = result.error as { code?: string; message?: string; details?: string; hint?: string } | null; const diagnostic = error ? ` error=${[error.code, error.message, error.details, error.hint].filter(Boolean).join(" | ") || "unspecified query error"}` : ""; console.log(`${names[index]} target=${groupId} result=${classification} count=${result.error ? "unknown" : result.matches}${diagnostic}`); });
  if (process.argv.includes("--diagnose")) return;
  if (deps.some((result) => result.error || result.matches !== 0)) throw new Error("Cleanup dependency preflight failed"); console.log("Cleanup dependency preflight: passed");
  const auditEntityIds = [...new Set([...invitationIds, ...userIds])];
  cleanupFailure("audit events", auditEntityIds, (await admin.from("audit_events").delete().in("entity_id", auditEntityIds)).error);
  cleanupFailure("memberships", userIds, (await admin.from("group_members").delete().in("profile_id", userIds)).error);
  if (invitationIds.length) cleanupFailure("invitations", invitationIds, (await admin.from("invitations").delete().in("id", invitationIds)).error);
  cleanupFailure("profiles", userIds, (await admin.from("profiles").delete().in("id", userIds)).error);
  cleanupFailure("Couple group", [groupId], (await admin.from("groups").delete().eq("id", groupId)).error);
  for (const id of authIds) cleanupFailure("Auth identity", [id], (await admin.auth.admin.deleteUser(id)).error);
  const [remaining, remainingAuthQuery] = await Promise.all([
    Promise.all([admin.from("invitations").select("id", { count: "exact", head: true }).in("email", emails), admin.from("profiles").select("id", { count: "exact", head: true }).in("id", userIds), admin.from("groups").select("id", { count: "exact", head: true }).eq("id", groupId), admin.from("group_members").select("id", { count: "exact", head: true }).in("profile_id", userIds), admin.from("audit_events").select("id", { count: "exact", head: true }).in("entity_id", auditEntityIds)]),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const remainingAuth = (remainingAuthQuery.data.users ?? []).filter((user) => user.email && emails.includes(user.email)).length;
  if (remaining.some((result) => result.error || result.count !== 0) || remainingAuthQuery.error || remainingAuth !== 0) throw new Error("Recovered artifacts remain"); console.log("Cleanup: passed\nVerifier artifacts remaining: 0");
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  console.log(`Couple verifier run: ${prefix}`);
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Refusing outside DEV");
  const admin = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const staff = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  fail((await staff.auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") })).error, "Admin sign-in");
  const { data: campus } = await admin.from("campuses").select("id").eq("active", true).limit(1).single(); if (!campus) throw new Error("No campus");
  let invitationIds: string[] = []; let groupId = ""; const userIds: string[] = [];
  try {
    const created = await (staff as unknown as RpcClient).rpc("create_invitations", { payload: { role: "couple", campus_id: campus.id, invitees: people } });
    fail(created.error, "Couple creation"); if (!created.data) throw new Error("Couple creation response missing"); invitationIds = created.data.invitation_ids; groupId = created.data.group_id;
    if (invitationIds.length !== 2 || !groupId) throw new Error("Couple creation shape");
    const { data: invitations } = await admin.from("invitations").select("id,email,phone,group_id").in("id", invitationIds);
    if (invitations?.length !== 2 || invitations.some((row: InvitationRow) => row.group_id !== groupId || row.phone !== people.find((person) => person.email === row.email)?.phone)) throw new Error("Invitation phone mapping");
    const { data: audit } = await admin.from("audit_events").select("id,entity_id,actor_id").in("entity_id", invitationIds).eq("event_type", "invitation.created");
    if (audit?.length !== 2 || audit.some((row) => !row.actor_id)) throw new Error("Audit contract");
    for (let index = 0; index < people.length; index += 1) {
      const person = people[index]!; const password = `Verify-${crypto.randomUUID()}!`;
      const auth = await admin.auth.admin.createUser({ email: person.email, password, email_confirm: true }); if (!auth.data.user) throw new Error("Auth creation"); userIds.push(auth.data.user.id);
      fail((await (staff as unknown as RpcClient).rpc("record_invitation_auth_identity", { target_invitation_id: invitationIds[index]!, target_auth_user_id: auth.data.user.id })).error, "Identity link");
      const link = await admin.auth.admin.generateLink({ type: "recovery", email: person.email, options: { redirectTo: `${required("APP_URL")}/auth/activate` } });
      const token = link.data.properties?.hashed_token; if (!token) throw new Error("Activation token missing");
      const invitee = createClient(url, publishableKey); fail((await invitee.auth.verifyOtp({ token_hash: token, type: "recovery" })).error, "Activation session"); fail((await (invitee as unknown as RpcClient).rpc("activate_invitation_account", {})).error, "Activation");
      fail((await invitee.auth.updateUser({ password: `Permanent-${crypto.randomUUID()}!` })).error, "Password setup");
      fail((await (invitee as unknown as RpcClient).rpc("enter_onboarding", {})).error, "Enter onboarding");
      if (index === 0) { const completion = await (invitee as unknown as RpcClient).rpc("complete_onboarding", {}); if (!completion.error) throw new Error("Onboarding completed without profile photo"); }
    }
    const { data: profiles } = await admin.from("profiles").select("id,email,phone,campus_id,status,onboarding_completed_at,photo_path,campus:campuses(name)").in("id", userIds);
    if (profiles?.length !== 2 || profiles.some((profile: ProfileRow) => profile.phone !== people.find((person) => person.email === profile.email)?.phone || profile.campus_id !== campus.id || profile.status !== "onboarding" || profile.onboarding_completed_at || profile.photo_path)) throw new Error("Onboarding profile seeding");
    const { data: memberships } = await admin.from("group_members").select("profile_id").eq("group_id", groupId).is("ended_at", null); if (memberships?.length !== 2) throw new Error("Couple memberships");
  } finally {
    const owned = await Promise.all([
      admin.from("invitations").select("id", { count: "exact", head: true }).in("id", invitationIds),
      admin.from("groups").select("id", { count: "exact", head: true }).eq("id", groupId),
      admin.from("profiles").select("id", { count: "exact", head: true }).in("id", userIds),
      admin.from("group_members").select("profile_id", { count: "exact", head: true }).eq("group_id", groupId).in("profile_id", userIds),
      admin.from("audit_events").select("id", { count: "exact", head: true }).in("entity_id", invitationIds).eq("event_type", "invitation.created"),
    ]);
    if (owned.some((result) => result.error) || owned.map((result) => result.count).some((count, index) => count !== [2, 1, 2, 2, 2][index])) throw new Error("Cleanup ownership preflight failed");
    console.log("Cleanup ownership preflight: passed");
    const dependencies = await Promise.all([
      admin.from("counseling_cases").select("id", { count: "exact", head: true }).eq("couple_group_id", groupId),
      admin.from("case_assignments").select("id", { count: "exact", head: true }).eq("assigned_group_id", groupId),
      admin.from("supervision_assignments").select("id", { count: "exact", head: true }).or(`coach_group_id.eq.${groupId},counselor_group_id.eq.${groupId}`),
      admin.from("campus_lead_coach_assignments").select("id", { count: "exact", head: true }).or(`campus_lead_group_id.eq.${groupId},coach_group_id.eq.${groupId}`),
    ]);
    if (dependencies.some((result) => result.error || result.count !== 0)) throw new Error("Cleanup dependency preflight failed");
    console.log("Cleanup dependency preflight: passed");
    const auditEntityIds = [...new Set([...invitationIds, ...userIds])];
    cleanupFailure("audit events", auditEntityIds, (await admin.from("audit_events").delete().in("entity_id", auditEntityIds)).error);
    cleanupFailure("memberships", userIds, (await admin.from("group_members").delete().in("profile_id", userIds)).error);
    cleanupFailure("invitations", invitationIds, (await admin.from("invitations").delete().in("id", invitationIds)).error);
    cleanupFailure("profiles", userIds, (await admin.from("profiles").delete().in("id", userIds)).error);
    cleanupFailure("Couple group", [groupId], (await admin.from("groups").delete().eq("id", groupId)).error);
    for (const userId of userIds) cleanupFailure("Auth identity", [userId], (await admin.auth.admin.deleteUser(userId)).error);
    const remaining = await Promise.all([
      admin.from("invitations").select("id", { count: "exact", head: true }).in("id", invitationIds), admin.from("groups").select("id", { count: "exact", head: true }).eq("id", groupId), admin.from("profiles").select("id", { count: "exact", head: true }).in("id", userIds), admin.from("group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId), admin.from("audit_events").select("id", { count: "exact", head: true }).in("entity_id", auditEntityIds),
    ]);
    if (remaining.some((result) => result.error || result.count !== 0)) throw new Error("Verifier artifacts remain after cleanup");
    console.log("Cleanup: passed"); console.log("Verifier artifacts remaining: 0");
  }
  console.log("Couple group count: 1; invitation count: 2; Auth identity count: 2; profile count: 2; membership count: 2; audit-event count: 2.");
  console.log("Partner 1 onboarding mapping passed. Partner 2 onboarding mapping passed. Profile photo requirement verified.");
  console.log("DEV Couple invitation lifecycle verified.");
}

const recoveryRunId = process.argv[2]; if (recoveryRunId) await recoverAndClean(recoveryRunId); else await main();
