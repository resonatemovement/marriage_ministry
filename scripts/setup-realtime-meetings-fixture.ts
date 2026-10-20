import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const CAMPUS_CODE = "DEV_TEST";
const COUPLE_NAME = "DEV — Realtime Meetings Test";
const COUNSELOR_TEAM_NAME = "DEV — Realtime Meetings Counselor Team";
const PRESERVED_HOMEWORK_CASE_ID = "9e789f4d-8536-4883-97e8-23cadb9f8508";

type AdminClient = SupabaseClient<Database>;
type FixtureUser = {
  emailEnv: string;
  passwordEnv: string;
  firstName: string;
  lastName: string;
  role: "couple" | "counselor";
};

const fixtureUsers = {
  counselorOne: { emailEnv: "PHASE3D_MEETINGS_COUNSELOR_1_EMAIL", passwordEnv: "PHASE3D_REALTIME_COUNSELOR_1_PASSWORD", firstName: "Meeting", lastName: "Counselor One", role: "counselor" },
  counselorTwo: { emailEnv: "PHASE3D_MEETINGS_COUNSELOR_2_EMAIL", passwordEnv: "PHASE3D_REALTIME_COUNSELOR_2_PASSWORD", firstName: "Meeting", lastName: "Counselor Two", role: "counselor" },
  partnerA: { emailEnv: "PHASE3D_MEETINGS_PARTNER_A_EMAIL", passwordEnv: "PHASE3D_REALTIME_PARTNER_A_PASSWORD", firstName: "Meeting", lastName: "Partner A", role: "couple" },
  partnerB: { emailEnv: "PHASE3D_MEETINGS_PARTNER_B_EMAIL", passwordEnv: "PHASE3D_REALTIME_PARTNER_B_PASSWORD", firstName: "Meeting", lastName: "Partner B", role: "couple" },
} as const satisfies Record<string, FixtureUser>;

type UserKey = keyof typeof fixtureUsers;
type UserIdentity = FixtureUser & { email: string; password: string; id: string };

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function configuration() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("Meeting fixture setup refused: configured Supabase project is not approved DEV.");
  }
  return {
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required("SUPABASE_SECRET_KEY"),
    adminEmail: required("TEST_ADMIN_EMAIL"),
    adminPassword: required("TEST_ADMIN_PASSWORD"),
    unrelatedCounselorEmail: required("TEST_COUNSELOR_EMAIL"),
    unrelatedCounselorPassword: required("TEST_COUNSELOR_PASSWORD"),
  };
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function publicClient(url: string, key: string) {
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authUsers(admin: AdminClient) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  fail(error, "Unable to list DEV Auth users");
  return data.users;
}

async function ensureUsers(admin: AdminClient) {
  const existing = await authUsers(admin);
  const result = {} as Record<UserKey, UserIdentity>;
  for (const [key, fixture] of Object.entries(fixtureUsers) as Array<[UserKey, FixtureUser]>) {
    const email = required(fixture.emailEnv).toLowerCase();
    const password = required(fixture.passwordEnv);
    const matches = existing.filter((user) => user.email?.toLowerCase() === email);
    if (matches.length > 1) throw new Error(`Duplicate Auth identities found for ${fixture.emailEnv}`);
    let authUser = matches[0];
    if (!authUser) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      fail(created.error, `Unable to create ${fixture.emailEnv}`);
      if (!created.data.user) throw new Error(`Auth identity missing for ${fixture.emailEnv}`);
      authUser = created.data.user;
    } else {
      const updated = await admin.auth.admin.updateUserById(authUser.id, { password, email_confirm: true });
      fail(updated.error, `Unable to refresh ${fixture.emailEnv}`);
    }
    result[key] = { ...fixture, email, password, id: authUser.id };
  }
  return result;
}

async function ensureProfilesAndRoles(admin: AdminClient, users: Record<UserKey, UserIdentity>, campusId: string, assignedBy: string) {
  for (const user of Object.values(users)) {
    const existingProfile = await admin.from("profiles").select("id,email").eq("email", user.email);
    fail(existingProfile.error, `Unable to inspect profile for ${user.emailEnv}`);
    if ((existingProfile.data ?? []).some((profile) => profile.id !== user.id)) throw new Error(`Profile email collision for ${user.emailEnv}`);
    const profile = await admin.from("profiles").upsert({
      id: user.id,
      campus_id: campusId,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      status: "active",
      deactivated_at: null,
      onboarding_completed_at: "2026-10-20T00:00:00.000Z",
    }, { onConflict: "id" });
    fail(profile.error, `Unable to ensure profile for ${user.emailEnv}`);

    const roles = await admin.from("profile_roles").select("role").eq("profile_id", user.id);
    fail(roles.error, `Unable to inspect role for ${user.emailEnv}`);
    const unexpected = (roles.data ?? []).filter(({ role }) => role !== user.role);
    if (unexpected.length) throw new Error(`Unexpected existing role for ${user.emailEnv}`);
    if (!(roles.data ?? []).some(({ role }) => role === user.role)) {
      const role = await admin.from("profile_roles").insert({ profile_id: user.id, role: user.role, assigned_by: assignedBy });
      fail(role.error, `Unable to assign role for ${user.emailEnv}`);
    }
  }
}

async function ensureGroup(admin: AdminClient, campusId: string, groupType: "couple" | "counselor_team", name: string) {
  const existing = await admin.from("groups").select("id,campus_id,active").eq("group_type", groupType).eq("name", name);
  fail(existing.error, `Unable to inspect ${name}`);
  if ((existing.data ?? []).length > 1) throw new Error(`Duplicate group found: ${name}`);
  if (existing.data?.[0]) {
    if (existing.data[0].campus_id !== campusId || !existing.data[0].active) throw new Error(`Existing group is not an active DEV-campus group: ${name}`);
    return existing.data[0].id;
  }
  const inserted = await admin.from("groups").insert({ campus_id: campusId, group_type: groupType, name }).select("id").single();
  fail(inserted.error, `Unable to create ${name}`);
  if (!inserted.data) throw new Error(`Created group missing: ${name}`);
  return inserted.data.id;
}

async function ensureMemberships(admin: AdminClient, groupId: string, groupType: "couple" | "counselor_team", profileIds: string[]) {
  const current = await admin.from("group_members").select("id,profile_id").eq("group_id", groupId).is("ended_at", null);
  fail(current.error, "Unable to inspect fixture group memberships");
  const unexpected = (current.data ?? []).filter(({ profile_id }) => !profileIds.includes(profile_id));
  if (unexpected.length) throw new Error("Fixture group has unexpected active members");

  for (const profileId of profileIds) {
    const memberships = await admin.from("group_members").select("id,group_id,groups!inner(group_type)").eq("profile_id", profileId).is("ended_at", null);
    fail(memberships.error, "Unable to inspect profile group memberships");
    const conflict = (memberships.data ?? []).find((membership) => membership.groups.group_type === groupType && membership.group_id !== groupId);
    if (conflict) throw new Error("Fixture profile already belongs to another active group of this type");
    if ((current.data ?? []).some((membership) => membership.profile_id === profileId)) continue;
    const inserted = await admin.from("group_members").insert({ group_id: groupId, profile_id: profileId });
    fail(inserted.error, "Unable to create fixture membership");
  }
}

async function ensureCase(admin: AdminClient, campusId: string, coupleGroupId: string, createdBy: string) {
  const existing = await admin.from("counseling_cases").select("id,campus_id,status,closed_at").eq("couple_group_id", coupleGroupId);
  fail(existing.error, "Unable to inspect Meeting fixture case");
  if ((existing.data ?? []).length > 1) throw new Error("Duplicate Meeting fixture cases found");
  if (existing.data?.[0]) {
    const row = existing.data[0];
    if (row.campus_id !== campusId || row.status !== "active" || row.closed_at) throw new Error("Existing Meeting fixture case is not in the expected active state");
    return row.id;
  }
  const inserted = await admin.from("counseling_cases").insert({ campus_id: campusId, couple_group_id: coupleGroupId, created_by: createdBy, status: "active" }).select("id").single();
  fail(inserted.error, "Unable to create Meeting fixture case");
  if (!inserted.data) throw new Error("Created Meeting fixture case is missing");
  return inserted.data.id;
}

async function ensureCounselorAssignment(admin: AdminClient, url: string, key: string, adminEmail: string, adminPassword: string, caseId: string, counselorGroupId: string) {
  const existing = await admin.from("case_assignments").select("id,assigned_group_id").eq("counseling_case_id", caseId).eq("assignment_type", "counselor").is("ended_at", null);
  fail(existing.error, "Unable to inspect Meeting fixture assignment");
  if ((existing.data ?? []).length > 1) throw new Error("Duplicate active Counselor assignments found");
  if (existing.data?.[0]) {
    if (existing.data[0].assigned_group_id !== counselorGroupId) throw new Error("Meeting fixture has an unexpected Counselor assignment");
    return existing.data[0].id;
  }
  const actor = publicClient(url, key);
  const auth = await actor.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  fail(auth.error, "Unable to authenticate DEV Admin for fixture assignment");
  const assignment = await actor.rpc("assign_counseling_case", {
    target_case_id: caseId,
    target_group_id: counselorGroupId,
    target_assignment_type: "counselor",
    reassignment_reason: "Dedicated Phase 3D-C Meeting Realtime fixture",
  });
  fail(assignment.error, "Unable to assign Meeting fixture Counselor");
  await actor.auth.signOut();
  if (!assignment.data) throw new Error("Created Meeting fixture assignment is missing");
  return assignment.data;
}

async function signedInClient(url: string, key: string, email: string, password: string) {
  const client = publicClient(url, key);
  const auth = await client.auth.signInWithPassword({ email, password });
  fail(auth.error, `Unable to sign in ${email}`);
  return client;
}

async function verifyRealtimeMount(client: AdminClient, caseId: string, label: string) {
  const channel = client.channel(`meeting-fixture-check:${label}:${caseId}`).on("postgres_changes", {
    event: "UPDATE",
    schema: "public",
    table: "case_session_meetings",
    filter: `counseling_case_id=eq.${caseId}`,
  }, () => undefined);
  const status = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime subscription timed out for ${label}`)), 10_000);
    channel.subscribe((nextStatus) => {
      if (nextStatus === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve(nextStatus);
      } else if (nextStatus === "CHANNEL_ERROR" || nextStatus === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(`Realtime subscription failed for ${label}: ${nextStatus}`));
      }
    });
  });
  await client.removeChannel(channel);
  return status;
}

async function verifyFixture(admin: AdminClient, config: ReturnType<typeof configuration>, users: Record<UserKey, UserIdentity>, caseId: string, coupleGroupId: string, counselorGroupId: string, assignmentId: string) {
  const [caseResult, membersResult, counselorMembersResult, meetingsResult, sessionsResult, notificationsResult, preservedResult] = await Promise.all([
    admin.from("counseling_cases").select("id,status,closed_at,campus_id").eq("id", caseId).single(),
    admin.from("group_members").select("profile_id").eq("group_id", coupleGroupId).is("ended_at", null),
    admin.from("group_members").select("profile_id").eq("group_id", counselorGroupId).is("ended_at", null),
    admin.from("case_session_meetings").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("case_sessions").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("counseling_cases").select("id,status").eq("id", PRESERVED_HOMEWORK_CASE_ID).single(),
  ]);
  for (const [label, result] of Object.entries({ caseResult, membersResult, counselorMembersResult, meetingsResult, sessionsResult, notificationsResult, preservedResult })) {
    fail(result.error, `Unable to verify ${label}`);
  }
  if (!caseResult.data || caseResult.data.status !== "active" || caseResult.data.closed_at) throw new Error("Meeting fixture case is not active");
  if ((membersResult.data ?? []).length !== 2 || (counselorMembersResult.data ?? []).length !== 2) throw new Error("Meeting fixture groups do not each have two active members");
  if (meetingsResult.count !== 0 || sessionsResult.count !== 0 || notificationsResult.count !== 0) throw new Error("Meeting fixture is not in a clean unscheduled state");

  const counselor = await signedInClient(config.url, config.publishableKey, users.counselorOne.email, users.counselorOne.password);
  const partnerA = await signedInClient(config.url, config.publishableKey, users.partnerA.email, users.partnerA.password);
  const partnerB = await signedInClient(config.url, config.publishableKey, users.partnerB.email, users.partnerB.password);
  const unrelated = await signedInClient(config.url, config.publishableKey, config.unrelatedCounselorEmail, config.unrelatedCounselorPassword);

  const [counselorCase, partnerATeam, partnerBTeam, unrelatedCase, counselorRealtime, partnerRealtime] = await Promise.all([
    counselor.from("counseling_cases").select("id").eq("id", caseId).maybeSingle(),
    partnerA.rpc("get_current_couple_case_team"),
    partnerB.rpc("get_current_couple_case_team"),
    unrelated.from("counseling_cases").select("id").eq("id", caseId).maybeSingle(),
    verifyRealtimeMount(counselor, caseId, "counselor"),
    verifyRealtimeMount(partnerA, caseId, "partner"),
  ]);
  fail(counselorCase.error, "Assigned Counselor cannot read fixture case");
  fail(partnerATeam.error, "Partner A cannot read Couple Workspace case");
  fail(partnerBTeam.error, "Partner B cannot read Couple Workspace case");
  fail(unrelatedCase.error, "Unable to verify unrelated Counselor denial");
  if (!counselorCase.data || partnerATeam.data?.[0]?.counseling_case_id !== caseId || partnerBTeam.data?.[0]?.counseling_case_id !== caseId) throw new Error("Authorized fixture access is incomplete");
  if (unrelatedCase.data) throw new Error("Unrelated Counselor can access Meeting fixture case");

  const anonymous = publicClient(config.url, config.publishableKey);
  const anonymousCase = await anonymous.from("counseling_cases").select("id").eq("id", caseId).maybeSingle();
  if (!anonymousCase.error || anonymousCase.error.code !== "42501") throw new Error("Anonymous case access was not denied");

  await Promise.all([counselor.auth.signOut(), partnerA.auth.signOut(), partnerB.auth.signOut(), unrelated.auth.signOut()]);
  counselor.realtime.disconnect();
  partnerA.realtime.disconnect();
  partnerB.realtime.disconnect();
  unrelated.realtime.disconnect();
  anonymous.realtime.disconnect();
  if (!preservedResult.data) throw new Error("Preserved Homework fixture case is missing");
  return { counselorRealtime, partnerRealtime, assignmentId, preservedCaseStatus: preservedResult.data.status };
}

async function run() {
  const config = configuration();
  const admin = createClient<Database>(config.url, config.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const existingAuth = await authUsers(admin);
  const adminIdentity = existingAuth.find((user) => user.email?.toLowerCase() === config.adminEmail.toLowerCase());
  if (!adminIdentity) throw new Error("Configured DEV Admin Auth identity is missing");
  const campuses = await admin.from("campuses").select("id,name,code,active").eq("code", CAMPUS_CODE);
  fail(campuses.error, "Unable to inspect existing DEV fixture campus");
  if ((campuses.data ?? []).length !== 1 || !campuses.data![0].active) throw new Error("Expected exactly one active existing DEV_TEST campus");
  const campus = campuses.data![0];

  const users = await ensureUsers(admin);
  await ensureProfilesAndRoles(admin, users, campus.id, adminIdentity.id);
  const coupleGroupId = await ensureGroup(admin, campus.id, "couple", COUPLE_NAME);
  const counselorGroupId = await ensureGroup(admin, campus.id, "counselor_team", COUNSELOR_TEAM_NAME);
  await ensureMemberships(admin, coupleGroupId, "couple", [users.partnerA.id, users.partnerB.id]);
  await ensureMemberships(admin, counselorGroupId, "counselor_team", [users.counselorOne.id, users.counselorTwo.id]);
  const caseId = await ensureCase(admin, campus.id, coupleGroupId, adminIdentity.id);
  const assignmentId = await ensureCounselorAssignment(admin, config.url, config.publishableKey, config.adminEmail, config.adminPassword, caseId, counselorGroupId);
  const verification = await verifyFixture(admin, config, users, caseId, coupleGroupId, counselorGroupId, assignmentId);

  console.log(JSON.stringify({
    projectRef: DEV_PROJECT_REF,
    campus: { id: campus.id, name: campus.name, code: campus.code },
    case: { id: caseId, name: COUPLE_NAME, status: "active", meetings: 0, caseSessions: 0 },
    coupleGroupId,
    counselorGroupId,
    counselorAssignmentId: assignmentId,
    profiles: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, email: user.email }])),
    authorization: { counselorRealtime: verification.counselorRealtime, partnerRealtime: verification.partnerRealtime, unrelatedCounselor: "denied", anonymous: "denied" },
    preservedHomeworkCase: { id: PRESERVED_HOMEWORK_CASE_ID, status: verification.preservedCaseStatus },
  }, null, 2));
}

await run();
