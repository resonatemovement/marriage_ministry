import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const CAMPUS_CODE = "DEV_TEST";
const COUNSELOR_TEAM_NAME = "DEV — Realtime Session & Case Counselor Team";
const PROGRESSION_COUPLE_NAME = "DEV — Realtime Session Progression Test";
const CLOSURE_COUPLE_NAME = "DEV — Realtime Case Closure Test";
const PRESERVED_CASE_IDS = [
  "9e789f4d-8536-4883-97e8-23cadb9f8508",
  "95eac800-d449-4d06-9555-cf13c7a178c7",
  "3ffef734-b8a6-4417-aca9-bd43041a9d17",
  "754e4d58-a378-4477-ac06-f93e6b878bc0",
] as const;

type Client = SupabaseClient<Database>;
type FixtureUser = {
  emailEnv: string;
  passwordEnv: string;
  firstName: string;
  lastName: string;
  role: "couple" | "counselor";
};

const fixtureUsers = {
  counselorOne: {
    emailEnv: "PHASE3D_C2_COUNSELOR_1_EMAIL",
    passwordEnv: "PHASE3D_C2_COUNSELOR_1_PASSWORD",
    firstName: "C2 Counselor",
    lastName: "One",
    role: "counselor",
  },
  counselorTwo: {
    emailEnv: "PHASE3D_C2_COUNSELOR_2_EMAIL",
    passwordEnv: "PHASE3D_C2_COUNSELOR_2_PASSWORD",
    firstName: "C2 Counselor",
    lastName: "Two",
    role: "counselor",
  },
  progressionPartnerA: {
    emailEnv: "PHASE3D_C2_PROGRESSION_PARTNER_A_EMAIL",
    passwordEnv: "PHASE3D_C2_PROGRESSION_PARTNER_A_PASSWORD",
    firstName: "Progression",
    lastName: "Partner A",
    role: "couple",
  },
  progressionPartnerB: {
    emailEnv: "PHASE3D_C2_PROGRESSION_PARTNER_B_EMAIL",
    passwordEnv: "PHASE3D_C2_PROGRESSION_PARTNER_B_PASSWORD",
    firstName: "Progression",
    lastName: "Partner B",
    role: "couple",
  },
  closurePartnerA: {
    emailEnv: "PHASE3D_C2_CLOSURE_PARTNER_A_EMAIL",
    passwordEnv: "PHASE3D_C2_CLOSURE_PARTNER_A_PASSWORD",
    firstName: "Closure",
    lastName: "Partner A",
    role: "couple",
  },
  closurePartnerB: {
    emailEnv: "PHASE3D_C2_CLOSURE_PARTNER_B_EMAIL",
    passwordEnv: "PHASE3D_C2_CLOSURE_PARTNER_B_PASSWORD",
    firstName: "Closure",
    lastName: "Partner B",
    role: "couple",
  },
} as const satisfies Record<string, FixtureUser>;

type UserKey = keyof typeof fixtureUsers;
type UserIdentity = FixtureUser & { email: string; password: string; id: string };
type FixtureMode = "create" | "resume-auth-trigger" | "verify";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function configuration() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("Phase 3D-C2 fixture setup refused: configured Supabase project is not approved DEV.");
  }
  return {
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required("SUPABASE_SECRET_KEY"),
    adminEmail: required("TEST_ADMIN_EMAIL").toLowerCase(),
    adminPassword: required("TEST_ADMIN_PASSWORD"),
    unrelatedCounselorEmail: required("TEST_COUNSELOR_EMAIL").toLowerCase(),
    unrelatedCounselorPassword: required("TEST_COUNSELOR_PASSWORD"),
    unrelatedCoupleEmail: required("PHASE3D_MEETINGS_PARTNER_A_EMAIL").toLowerCase(),
    unrelatedCouplePassword: required("PHASE3D_REALTIME_PARTNER_A_PASSWORD"),
  };
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function publicClient(url: string, key: string) {
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function listAuthUsers(admin: Client) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  fail(error, "Unable to list DEV Auth users");
  return data.users;
}

async function resolveMode(admin: Client) {
  const authUsers = await listAuthUsers(admin);
  const matches = Object.values(fixtureUsers).map((fixture) => {
    const email = required(fixture.emailEnv).toLowerCase();
    const found = authUsers.filter((user) => user.email?.toLowerCase() === email);
    if (found.length > 1) throw new Error(`Duplicate Auth identities found for ${fixture.emailEnv}`);
    return found[0] ?? null;
  });
  const existingCount = matches.filter(Boolean).length;
  if (existingCount !== 0 && existingCount !== matches.length) {
    throw new Error("Incomplete Phase 3D-C2 Auth fixture detected; refusing to repair or overwrite it.");
  }
  if (existingCount === 0) return { mode: "create" as FixtureMode, authUsers, matches };

  const ids = matches.map((user) => user!.id);
  const [namedGroups, profiles, roles] = await Promise.all([
    admin.from("groups").select("id,name").in("name", [COUNSELOR_TEAM_NAME, PROGRESSION_COUPLE_NAME, CLOSURE_COUPLE_NAME]),
    admin.from("profiles").select("id,email").in("id", ids),
    admin.from("profile_roles").select("profile_id").in("profile_id", ids),
  ]);
  fail(namedGroups.error, "Unable to inspect Phase 3D-C2 group state");
  fail(profiles.error, "Unable to inspect Phase 3D-C2 Auth-trigger profiles");
  fail(roles.error, "Unable to inspect Phase 3D-C2 profile roles");
  const expectedEmails = new Map(Object.values(fixtureUsers).map((fixture) => [required(fixture.emailEnv).toLowerCase(), true]));
  const triggerOnlyState =
    namedGroups.data?.length === 0 &&
    roles.data?.length === 0 &&
    profiles.data?.length === ids.length &&
    profiles.data.every((profile) => typeof profile.email === "string" && expectedEmails.has(profile.email.toLowerCase()));
  if (triggerOnlyState) return { mode: "resume-auth-trigger" as FixtureMode, authUsers, matches };
  if (namedGroups.data?.length !== 3) {
    throw new Error("Incomplete Phase 3D-C2 fixture detected after Auth provisioning; refusing to repair or overwrite it.");
  }
  return { mode: "verify" as FixtureMode, authUsers, matches };
}

async function ensureUsers(admin: Client, mode: FixtureMode, existingMatches: Awaited<ReturnType<typeof listAuthUsers>>) {
  const result = {} as Record<UserKey, UserIdentity>;
  const entries = Object.entries(fixtureUsers) as Array<[UserKey, FixtureUser]>;
  for (const [index, [key, fixture]] of entries.entries()) {
    const email = required(fixture.emailEnv).toLowerCase();
    const password = required(fixture.passwordEnv);
    let authUser = existingMatches[index];
    if (mode === "create") {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      fail(created.error, `Unable to create ${fixture.emailEnv}`);
      if (!created.data.user) throw new Error(`Created Auth identity missing for ${fixture.emailEnv}`);
      authUser = created.data.user;
    }
    if (!authUser || authUser.email?.toLowerCase() !== email || !authUser.email_confirmed_at) {
      throw new Error(`Fixture Auth identity is missing, mismatched, or unconfirmed for ${fixture.emailEnv}`);
    }
    result[key] = { ...fixture, email, password, id: authUser.id };
  }
  return result;
}

async function ensureProfilesAndRoles(
  admin: Client,
  users: Record<UserKey, UserIdentity>,
  campusId: string,
  assignedBy: string,
  mode: FixtureMode,
) {
  for (const user of Object.values(users)) {
    const byEmail = await admin.from("profiles").select("id").ilike("email", user.email);
    fail(byEmail.error, `Unable to inspect profile email for ${user.emailEnv}`);
    if ((byEmail.data ?? []).some(({ id }) => id !== user.id)) throw new Error(`Profile email collision for ${user.emailEnv}`);

    const existing = await admin
      .from("profiles")
      .select("id,email,first_name,last_name,campus_id,status,onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    fail(existing.error, `Unable to inspect profile for ${user.emailEnv}`);
    if (mode === "create" || mode === "resume-auth-trigger") {
      if (
        !existing.data ||
        typeof existing.data.email !== "string" ||
        existing.data.email.toLowerCase() !== user.email
      ) {
        throw new Error(`Expected the Auth trigger profile for ${user.emailEnv}`);
      }
      const updated = await admin.from("profiles").update({
        id: user.id,
        campus_id: campusId,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        status: "active",
        onboarding_completed_at: new Date().toISOString(),
      }).eq("id", user.id);
      fail(updated.error, `Unable to complete profile for ${user.emailEnv}`);
      const role = await admin.from("profile_roles").insert({ profile_id: user.id, role: user.role, assigned_by: assignedBy });
      fail(role.error, `Unable to assign role for ${user.emailEnv}`);
      continue;
    }

    const profile = existing.data;
    if (
      !profile ||
      typeof profile.email !== "string" ||
      profile.email.toLowerCase() !== user.email ||
      profile.first_name !== user.firstName ||
      profile.last_name !== user.lastName ||
      profile.campus_id !== campusId ||
      profile.status !== "active" ||
      !profile.onboarding_completed_at
    ) {
      throw new Error(`Existing profile no longer matches the Phase 3D-C2 fixture contract for ${user.emailEnv}`);
    }
    const roles = await admin.from("profile_roles").select("role").eq("profile_id", user.id);
    fail(roles.error, `Unable to inspect roles for ${user.emailEnv}`);
    if (roles.data?.length !== 1 || roles.data[0].role !== user.role) {
      throw new Error(`Existing role no longer matches the Phase 3D-C2 fixture contract for ${user.emailEnv}`);
    }
  }
}

async function ensureGroup(
  admin: Client,
  campusId: string,
  groupType: "couple" | "counselor_team",
  name: string,
  mode: FixtureMode,
) {
  const existing = await admin.from("groups").select("id,campus_id,active").eq("group_type", groupType).eq("name", name);
  fail(existing.error, `Unable to inspect ${name}`);
  if ((existing.data ?? []).length > 1) throw new Error(`Duplicate group found: ${name}`);
  if (mode === "verify") {
    const group = existing.data?.[0];
    if (!group || group.campus_id !== campusId || !group.active) throw new Error(`Existing fixture group is missing or changed: ${name}`);
    return group.id;
  }
  if (existing.data?.length) throw new Error(`Unexpected group-name collision: ${name}`);
  const inserted = await admin.from("groups").insert({ campus_id: campusId, group_type: groupType, name }).select("id").single();
  fail(inserted.error, `Unable to create ${name}`);
  if (!inserted.data) throw new Error(`Created group missing: ${name}`);
  return inserted.data.id;
}

async function ensureMemberships(
  admin: Client,
  groupId: string,
  groupType: "couple" | "counselor_team",
  profileIds: string[],
  mode: FixtureMode,
) {
  const current = await admin.from("group_members").select("profile_id").eq("group_id", groupId).is("ended_at", null);
  fail(current.error, "Unable to inspect fixture group memberships");
  const actual = (current.data ?? []).map(({ profile_id }) => profile_id).sort();
  const expected = [...profileIds].sort();
  if (mode === "verify") {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Existing fixture group membership is incomplete or changed");
    return;
  }
  if (actual.length) throw new Error("Unexpected membership collision on a newly created fixture group");
  for (const profileId of profileIds) {
    const activeGroups = await admin
      .from("group_members")
      .select("group_id,groups!inner(group_type)")
      .eq("profile_id", profileId)
      .is("ended_at", null);
    fail(activeGroups.error, "Unable to inspect fixture profile memberships");
    if ((activeGroups.data ?? []).some((membership) => membership.groups.group_type === groupType)) {
      throw new Error("Fixture profile already belongs to another active group of the same type");
    }
  }
  const inserted = await admin.from("group_members").insert(profileIds.map((profile_id) => ({ group_id: groupId, profile_id })));
  fail(inserted.error, "Unable to create fixture group memberships");
}

async function ensureCase(admin: Client, campusId: string, coupleGroupId: string, createdBy: string, mode: FixtureMode) {
  const existing = await admin
    .from("counseling_cases")
    .select("id,campus_id,status,closed_at")
    .eq("couple_group_id", coupleGroupId);
  fail(existing.error, "Unable to inspect Phase 3D-C2 fixture case");
  if ((existing.data ?? []).length > 1) throw new Error("Duplicate Phase 3D-C2 fixture Cases found");
  if (mode === "verify") {
    const row = existing.data?.[0];
    if (!row || row.campus_id !== campusId || row.status !== "active" || row.closed_at) {
      throw new Error("Existing Phase 3D-C2 fixture Case is missing or no longer in its clean active state");
    }
    return row.id;
  }
  if (existing.data?.length) throw new Error("Unexpected Case collision for a newly created fixture Couple");
  const inserted = await admin
    .from("counseling_cases")
    .insert({ campus_id: campusId, couple_group_id: coupleGroupId, created_by: createdBy, status: "active" })
    .select("id")
    .single();
  fail(inserted.error, "Unable to create Phase 3D-C2 fixture Case");
  if (!inserted.data) throw new Error("Created Phase 3D-C2 fixture Case is missing");
  return inserted.data.id;
}

async function ensureCounselorAssignment(
  admin: Client,
  config: ReturnType<typeof configuration>,
  caseId: string,
  counselorGroupId: string,
  mode: FixtureMode,
) {
  const existing = await admin.from("case_assignments").select("id,assigned_group_id,assignment_type").eq("counseling_case_id", caseId).is("ended_at", null);
  fail(existing.error, "Unable to inspect Phase 3D-C2 Case assignment");
  if (mode === "verify") {
    const assignment = existing.data?.[0];
    if (
      existing.data?.length !== 1 ||
      !assignment ||
      assignment.assignment_type !== "counselor" ||
      assignment.assigned_group_id !== counselorGroupId
    ) {
      throw new Error("Existing Phase 3D-C2 Case assignment is incomplete or changed");
    }
    return assignment.id;
  }
  if (existing.data?.length) throw new Error("Unexpected active assignment on a newly created fixture Case");
  const actor = publicClient(config.url, config.publishableKey);
  const auth = await actor.auth.signInWithPassword({ email: config.adminEmail, password: config.adminPassword });
  fail(auth.error, "Unable to authenticate DEV Admin for fixture assignment");
  const assigned = await actor.rpc("assign_counseling_case", {
    target_case_id: caseId,
    target_group_id: counselorGroupId,
    target_assignment_type: "counselor",
    reassignment_reason: "Dedicated Phase 3D-C2 Realtime fixture",
  });
  await actor.auth.signOut();
  fail(assigned.error, "Unable to assign the Phase 3D-C2 Counselor team");
  if (!assigned.data) throw new Error("Created Phase 3D-C2 Counselor assignment is missing");
  return assigned.data;
}

async function signedInClient(url: string, key: string, email: string, password: string) {
  const client = publicClient(url, key);
  const auth = await client.auth.signInWithPassword({ email, password });
  fail(auth.error, `Unable to authenticate ${email}`);
  return client;
}

async function caseSnapshot(admin: Client, caseIds: readonly string[]) {
  const cases = await admin.from("counseling_cases").select("id,status,closed_at,updated_at").in("id", [...caseIds]).order("id");
  fail(cases.error, "Unable to snapshot preserved Cases");
  if (cases.data?.length !== caseIds.length) throw new Error("A preserved DEV fixture Case is missing");
  const rows = [];
  for (const counselingCase of cases.data) {
    const [sessions, meetings, deliveries, homework] = await Promise.all([
      admin.from("case_sessions").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("case_session_meetings").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("homework_assignments").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
    ]);
    for (const [label, result] of Object.entries({ sessions, meetings, deliveries, homework })) {
      fail(result.error, `Unable to snapshot preserved Case ${label}`);
    }
    rows.push({ ...counselingCase, sessions: sessions.count, meetings: meetings.count, deliveries: deliveries.count, homework: homework.count });
  }
  return rows;
}

async function verifyPublishedSessions(admin: Client) {
  const sessions = await admin.from("sessions").select("id,title,sequence_number,status,is_final").eq("status", "published").order("sequence_number");
  fail(sessions.error, "Unable to inspect published Session templates");
  const first = sessions.data?.find((session) => !session.is_final);
  const final = sessions.data?.find((session) => session.is_final);
  if (!first || !final) throw new Error("Published non-final and explicit Final Session templates are required");

  for (const session of [first, final]) {
    const material = await admin.from("session_material_blocks").select("id", { count: "exact", head: true }).eq("session_id", session.id);
    fail(material.error, `Unable to inspect Material for ${session.title}`);
    if (!material.count) throw new Error(`Published Session has no active Material: ${session.title}`);
  }

  const homeworks = await admin.from("homeworks").select("id,session_id").eq("session_id", first.id).is("withdrawn_at", null);
  fail(homeworks.error, "Unable to inspect Session 1 Homework");
  if (homeworks.data?.length !== 1) throw new Error("Expected one active Homework root for the first published Session");
  const versions = await admin.from("homework_versions").select("id,version_number").eq("homework_id", homeworks.data[0].id).eq("status", "published");
  fail(versions.error, "Unable to inspect Session 1 published Homework version");
  if (versions.data?.length !== 1) throw new Error("Expected one published Homework version for the first published Session");
  const blocks = await admin.from("homework_version_blocks").select("id", { count: "exact", head: true }).eq("homework_version_id", versions.data[0].id);
  fail(blocks.error, "Unable to inspect Session 1 Homework blocks");
  if (!blocks.count) throw new Error("The first published Session Homework version has no blocks");

  return {
    publishedCount: sessions.data?.length ?? 0,
    firstSession: { id: first.id, title: first.title, storedSequence: first.sequence_number, isFinal: first.is_final, homeworkVersion: versions.data[0].version_number, homeworkBlocks: blocks.count },
    finalSession: { id: final.id, title: final.title, storedSequence: final.sequence_number, isFinal: final.is_final },
  };
}

async function verifyCleanCase(admin: Client, caseId: string, coupleGroupId: string, counselorGroupId: string, expectedPartners: string[]) {
  const [caseResult, coupleMembers, counselorMembers, sessions, meetings, homework, deliveries, invitations] = await Promise.all([
    admin.from("counseling_cases").select("id,status,closed_at,couple_group_id").eq("id", caseId).single(),
    admin.from("group_members").select("profile_id").eq("group_id", coupleGroupId).is("ended_at", null),
    admin.from("group_members").select("profile_id").eq("group_id", counselorGroupId).is("ended_at", null),
    admin.from("case_sessions").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("case_session_meetings").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("homework_assignments").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("counseling_case_id", caseId),
    admin.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", coupleGroupId),
  ]);
  for (const [label, result] of Object.entries({ caseResult, coupleMembers, counselorMembers, sessions, meetings, homework, deliveries, invitations })) {
    fail(result.error, `Unable to verify clean fixture ${label}`);
  }
  if (!caseResult.data || caseResult.data.status !== "active" || caseResult.data.closed_at || caseResult.data.couple_group_id !== coupleGroupId) {
    throw new Error("Fixture Case is not in the expected active state");
  }
  const actualPartners = (coupleMembers.data ?? []).map(({ profile_id }) => profile_id).sort();
  if (JSON.stringify(actualPartners) !== JSON.stringify([...expectedPartners].sort()) || counselorMembers.data?.length !== 2) {
    throw new Error("Fixture group memberships do not match the expected two-person groups");
  }
  if (sessions.count || meetings.count || homework.count || deliveries.count || invitations.count) {
    throw new Error("Fixture contains unexpected lifecycle, Homework, delivery, or invitation residue");
  }
}

async function verifyRealtimeMount(client: Client, caseId: string, label: string) {
  const channel = client
    .channel(`c2-fixture-readiness:${label}:${caseId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "case_sessions", filter: `counseling_case_id=eq.${caseId}` }, () => undefined)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "case_sessions", filter: `counseling_case_id=eq.${caseId}` }, () => undefined)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "counseling_cases", filter: `id=eq.${caseId}` }, () => undefined);
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

async function verifyAccess(
  config: ReturnType<typeof configuration>,
  users: Record<UserKey, UserIdentity>,
  progressionCaseId: string,
  closureCaseId: string,
) {
  const clients = {
    counselorOne: await signedInClient(config.url, config.publishableKey, users.counselorOne.email, users.counselorOne.password),
    counselorTwo: await signedInClient(config.url, config.publishableKey, users.counselorTwo.email, users.counselorTwo.password),
    progressionA: await signedInClient(config.url, config.publishableKey, users.progressionPartnerA.email, users.progressionPartnerA.password),
    progressionB: await signedInClient(config.url, config.publishableKey, users.progressionPartnerB.email, users.progressionPartnerB.password),
    closureA: await signedInClient(config.url, config.publishableKey, users.closurePartnerA.email, users.closurePartnerA.password),
    closureB: await signedInClient(config.url, config.publishableKey, users.closurePartnerB.email, users.closurePartnerB.password),
    unrelatedCounselor: await signedInClient(config.url, config.publishableKey, config.unrelatedCounselorEmail, config.unrelatedCounselorPassword),
    unrelatedCouple: await signedInClient(config.url, config.publishableKey, config.unrelatedCoupleEmail, config.unrelatedCouplePassword),
  };
  try {
    for (const counselor of [clients.counselorOne, clients.counselorTwo]) {
      const result = await counselor.from("counseling_cases").select("id").in("id", [progressionCaseId, closureCaseId]);
      fail(result.error, "Assigned Counselor cannot read both Phase 3D-C2 Cases");
      if (result.data?.length !== 2) throw new Error("Assigned Counselor cannot read both Phase 3D-C2 Cases");
    }

    const partnerCases = [
      [clients.progressionA, progressionCaseId, closureCaseId],
      [clients.progressionB, progressionCaseId, closureCaseId],
      [clients.closureA, closureCaseId, progressionCaseId],
      [clients.closureB, closureCaseId, progressionCaseId],
    ] as const;
    for (const [client, ownCase, otherCase] of partnerCases) {
      const workspace = await client.rpc("get_current_couple_case_team");
      fail(workspace.error, "Fixture partner cannot resolve Couple Workspace");
      if (workspace.data?.[0]?.counseling_case_id !== ownCase) throw new Error("Fixture partner resolved the wrong Couple Workspace Case");
      const other = await client.from("counseling_cases").select("id").eq("id", otherCase);
      fail(other.error, "Unable to verify cross-Couple isolation");
      if (other.data?.length) throw new Error("Fixture partner can read the other Phase 3D-C2 Case");
    }

    for (const unrelated of [clients.unrelatedCounselor, clients.unrelatedCouple]) {
      const result = await unrelated.from("counseling_cases").select("id").in("id", [progressionCaseId, closureCaseId]);
      fail(result.error, "Unable to verify unrelated-user Case isolation");
      if (result.data?.length) throw new Error("An unrelated authenticated user can read a Phase 3D-C2 Case");
    }

    const anonymous = publicClient(config.url, config.publishableKey);
    const denied = await anonymous.from("counseling_cases").select("id").in("id", [progressionCaseId, closureCaseId]);
    if (!denied.error || denied.error.code !== "42501") throw new Error("Anonymous Case access was not denied");
    anonymous.realtime.disconnect();

    const realtime = await Promise.all([
      verifyRealtimeMount(clients.counselorOne, progressionCaseId, "counselor-progression"),
      verifyRealtimeMount(clients.counselorOne, closureCaseId, "counselor-closure"),
      verifyRealtimeMount(clients.progressionA, progressionCaseId, "partner-progression"),
      verifyRealtimeMount(clients.closureA, closureCaseId, "partner-closure"),
    ]);
    return { authenticatedAccounts: 6, assignedCounselors: "allowed", ownCouple: "allowed", crossCouple: "denied", unrelatedCounselor: "denied", unrelatedCouple: "denied", anonymous: "denied", realtime };
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
    Object.values(clients).forEach((client) => client.realtime.disconnect());
  }
}

async function run() {
  const config = configuration();
  const admin = createClient<Database>(config.url, config.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const before = await caseSnapshot(admin, PRESERVED_CASE_IDS);
  const resolved = await resolveMode(admin);
  const adminIdentity = resolved.authUsers.find((user) => user.email?.toLowerCase() === config.adminEmail);
  if (!adminIdentity) throw new Error("Configured DEV Admin Auth identity is missing");

  const campuses = await admin.from("campuses").select("id,name,code,active").eq("code", CAMPUS_CODE);
  fail(campuses.error, "Unable to inspect existing DEV fixture Campus");
  if (campuses.data?.length !== 1 || !campuses.data[0].active) throw new Error("Expected exactly one active existing DEV_TEST Campus");
  const campus = campuses.data[0];
  const users = await ensureUsers(admin, resolved.mode, resolved.matches.filter(Boolean) as Awaited<ReturnType<typeof listAuthUsers>>);
  await ensureProfilesAndRoles(admin, users, campus.id, adminIdentity.id, resolved.mode);

  const counselorGroupId = await ensureGroup(admin, campus.id, "counselor_team", COUNSELOR_TEAM_NAME, resolved.mode);
  const progressionGroupId = await ensureGroup(admin, campus.id, "couple", PROGRESSION_COUPLE_NAME, resolved.mode);
  const closureGroupId = await ensureGroup(admin, campus.id, "couple", CLOSURE_COUPLE_NAME, resolved.mode);
  await ensureMemberships(admin, counselorGroupId, "counselor_team", [users.counselorOne.id, users.counselorTwo.id], resolved.mode);
  await ensureMemberships(admin, progressionGroupId, "couple", [users.progressionPartnerA.id, users.progressionPartnerB.id], resolved.mode);
  await ensureMemberships(admin, closureGroupId, "couple", [users.closurePartnerA.id, users.closurePartnerB.id], resolved.mode);

  const progressionCaseId = await ensureCase(admin, campus.id, progressionGroupId, adminIdentity.id, resolved.mode);
  const closureCaseId = await ensureCase(admin, campus.id, closureGroupId, adminIdentity.id, resolved.mode);
  const progressionAssignmentId = await ensureCounselorAssignment(admin, config, progressionCaseId, counselorGroupId, resolved.mode);
  const closureAssignmentId = await ensureCounselorAssignment(admin, config, closureCaseId, counselorGroupId, resolved.mode);

  await verifyCleanCase(admin, progressionCaseId, progressionGroupId, counselorGroupId, [users.progressionPartnerA.id, users.progressionPartnerB.id]);
  await verifyCleanCase(admin, closureCaseId, closureGroupId, counselorGroupId, [users.closurePartnerA.id, users.closurePartnerB.id]);
  const [sessionReadiness, authorization, after] = await Promise.all([
    verifyPublishedSessions(admin),
    verifyAccess(config, users, progressionCaseId, closureCaseId),
    caseSnapshot(admin, PRESERVED_CASE_IDS),
  ]);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("An existing DEV fixture changed during Phase 3D-C2 provisioning");

  console.log(JSON.stringify({
    projectRef: DEV_PROJECT_REF,
    mode: resolved.mode,
    campus: { id: campus.id, name: campus.name, code: campus.code },
    counselorTeam: { id: counselorGroupId, name: COUNSELOR_TEAM_NAME },
    fixtures: {
      progression: { name: PROGRESSION_COUPLE_NAME, groupId: progressionGroupId, caseId: progressionCaseId, assignmentId: progressionAssignmentId, status: "active", meetings: 0, caseSessions: 0, homeworkAssignments: 0, deliveries: 0 },
      closure: { name: CLOSURE_COUPLE_NAME, groupId: closureGroupId, caseId: closureCaseId, assignmentId: closureAssignmentId, status: "active", meetings: 0, caseSessions: 0, homeworkAssignments: 0, deliveries: 0 },
    },
    accounts: Object.fromEntries(Object.entries(users).map(([key, user]) => [key, { id: user.id, email: user.email, emailEnv: user.emailEnv, passwordEnv: user.passwordEnv }])),
    sessionReadiness,
    authorization,
    preservedCases: after,
  }, null, 2));
}

await run();
