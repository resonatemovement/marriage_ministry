import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const TEST_CAMPUS = { name: "Test Campus", code: "DEV_TEST" };

type TestRole = Database["public"]["Enums"]["app_role"];
type TestUser = {
  key: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: readonly TestRole[];
};

const testUsers: readonly TestUser[] = [
  { key: "superAdmin", email: "TEST_SUPER_ADMIN_EMAIL", password: "TEST_SUPER_ADMIN_PASSWORD", firstName: "Test", lastName: "Super Admin", roles: ["super_admin"] },
  { key: "admin", email: "TEST_ADMIN_EMAIL", password: "TEST_ADMIN_PASSWORD", firstName: "Test", lastName: "Admin", roles: ["admin"] },
  { key: "coach", email: "TEST_COACH_EMAIL", password: "TEST_COACH_PASSWORD", firstName: "Test", lastName: "Coach", roles: ["coach"] },
  { key: "coach2", email: "TEST_COACH_2_EMAIL", password: "TEST_COACH_2_PASSWORD", firstName: "Test", lastName: "Coach Two", roles: ["coach"] },
  { key: "counselor", email: "TEST_COUNSELOR_EMAIL", password: "TEST_COUNSELOR_PASSWORD", firstName: "Test", lastName: "Counselor", roles: ["counselor"] },
  { key: "counselor2", email: "TEST_COUNSELOR_2_EMAIL", password: "TEST_COUNSELOR_2_PASSWORD", firstName: "Test", lastName: "Counselor Two", roles: ["counselor"] },
  { key: "couple1", email: "TEST_COUPLE_1_EMAIL", password: "TEST_COUPLE_1_PASSWORD", firstName: "Test", lastName: "Couple One", roles: ["couple"] },
  { key: "couple2", email: "TEST_COUPLE_2_EMAIL", password: "TEST_COUPLE_2_PASSWORD", firstName: "Test", lastName: "Couple Two", roles: ["couple"] },
  { key: "author", email: "TEST_AUTHOR_EMAIL", password: "TEST_AUTHOR_PASSWORD", firstName: "Test", lastName: "Author", roles: ["author"] },
  { key: "multiRole", email: "TEST_MULTIROLE_EMAIL", password: "TEST_MULTIROLE_PASSWORD", firstName: "Test", lastName: "Multi Role", roles: ["super_admin", "coach"] },
] as const;

type TestUserKey = TestUser["key"];
type TestUserIds = Record<TestUserKey, string>;
type FixtureIds = { campus: string; couple: string; coach: string; counselor: string; case: string };

function requireEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getConfiguration() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const hostname = new URL(url).hostname;
  if (hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("DEV test-user setup refused: configured Supabase project is not the approved DEV project.");
  }

  return {
    url,
    publishableKey,
    secretKey: requireEnvironmentVariable("SUPABASE_SECRET_KEY"),
    users: testUsers.map((user) => ({ ...user, emailAddress: requireEnvironmentVariable(user.email).toLowerCase(), passwordValue: requireEnvironmentVariable(user.password) })),
  };
}

function createAdminClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function createPublicClient(url: string, publishableKey: string) {
  return createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function failIfError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

async function findAuthUsers(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  failIfError(error, "Unable to list Auth users");
  return new Map(data.users.filter((user) => user.email).map((user) => [user.email!.toLowerCase(), user]));
}

async function ensureAuthUsers(admin: ReturnType<typeof createAdminClient>, users: ReturnType<typeof getConfiguration>["users"]) {
  const existing = await findAuthUsers(admin);
  const ids = {} as TestUserIds;

  for (const user of users) {
    let authUser = existing.get(user.emailAddress);
    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({ email: user.emailAddress, password: user.passwordValue, email_confirm: true });
      failIfError(error, `Unable to create Auth user for ${user.key}`);
      if (!data.user) throw new Error(`Unable to create Auth user for ${user.key}`);
      authUser = data.user;
    }
    ids[user.key] = authUser.id;
  }

  return ids;
}

async function ensureCampus(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.from("campuses").select("id").eq("code", TEST_CAMPUS.code);
  failIfError(error, "Unable to read the DEV test campus");
  const campuses = data ?? [];
  if (campuses.length > 1) throw new Error("Duplicate DEV test campuses found");
  if (campuses[0]) return campuses[0].id;

  const { data: campus, error: insertError } = await admin.from("campuses").insert(TEST_CAMPUS).select("id").single();
  failIfError(insertError, "Unable to create the DEV test campus");
  if (!campus) throw new Error("Unable to create the DEV test campus");
  return campus.id;
}

async function ensureProfilesAndRoles(admin: ReturnType<typeof createAdminClient>, users: ReturnType<typeof getConfiguration>["users"], ids: TestUserIds, campusId: string) {
  for (const user of users) {
    const { error: profileError } = await admin.from("profiles").upsert({ id: ids[user.key], campus_id: campusId, email: user.emailAddress, first_name: user.firstName, last_name: user.lastName, status: "active", deactivated_at: null }, { onConflict: "id" });
    failIfError(profileError, `Unable to ensure profile for ${user.key}`);
    const { data: existingRoles, error: readRolesError } = await admin.from("profile_roles").select("role").eq("profile_id", ids[user.key]);
    failIfError(readRolesError, `Unable to read roles for ${user.key}`);
    const expectedRoles = new Set<Database["public"]["Enums"]["app_role"]>(user.roles);
    for (const existingRole of existingRoles ?? []) {
      if (expectedRoles.has(existingRole.role)) continue;
      const { error: cleanupError } = await admin.from("profile_roles").delete().eq("profile_id", ids[user.key]).eq("role", existingRole.role);
      failIfError(cleanupError, `Unable to clear unexpected role for ${user.key}`);
    }
    for (const role of expectedRoles) {
      const { error: roleError } = await admin.from("profile_roles").upsert({ profile_id: ids[user.key], role, assigned_by: ids.superAdmin }, { onConflict: "profile_id,role" });
      failIfError(roleError, `Unable to assign ${role} role for ${user.key}`);
    }
  }
}

async function ensureGroup(admin: ReturnType<typeof createAdminClient>, campusId: string, groupType: Database["public"]["Enums"]["group_type"], name: string) {
  const { data, error } = await admin.from("groups").select("id").eq("group_type", groupType).eq("name", name);
  failIfError(error, `Unable to read ${name}`);
  const groups = data ?? [];
  if (groups.length > 1) throw new Error(`Duplicate ${name} groups found`);
  if (groups[0]) return groups[0].id;
  const { data: group, error: insertError } = await admin.from("groups").insert({ campus_id: campusId, group_type: groupType, name }).select("id").single();
  failIfError(insertError, `Unable to create ${name}`);
  if (!group) throw new Error(`Unable to create ${name}`);
  return group.id;
}

async function ensureMembership(admin: ReturnType<typeof createAdminClient>, groupId: string, profileId: string) {
  const { data, error } = await admin.from("group_members").select("id").eq("group_id", groupId).eq("profile_id", profileId).is("ended_at", null);
  failIfError(error, "Unable to read DEV test group membership");
  const memberships = data ?? [];
  if (memberships.length > 1) throw new Error("Duplicate active DEV test group memberships found");
  if (memberships[0]) return;
  const { error: insertError } = await admin.from("group_members").insert({ group_id: groupId, profile_id: profileId });
  failIfError(insertError, "Unable to create DEV test group membership");
}

async function ensureCase(admin: ReturnType<typeof createAdminClient>, fixture: Omit<FixtureIds, "case">, ids: TestUserIds) {
  const { data, error } = await admin.from("counseling_cases").select("id").eq("couple_group_id", fixture.couple);
  failIfError(error, "Unable to read DEV test counseling case");
  const cases = data ?? [];
  if (cases.length > 1) throw new Error("Duplicate DEV test counseling cases found");
  let caseId = cases[0]?.id;
  if (!caseId) {
    const { data: counselingCase, error: insertError } = await admin.from("counseling_cases").insert({ campus_id: fixture.campus, couple_group_id: fixture.couple, created_by: ids.admin }).select("id").single();
    failIfError(insertError, "Unable to create DEV test counseling case");
    if (!counselingCase) throw new Error("Unable to create DEV test counseling case");
    caseId = counselingCase.id;
  }
  return caseId;
}

async function ensureAssignment(admin: ReturnType<typeof createAdminClient>, url: string, publishableKey: string, adminEmail: string, adminPassword: string, caseId: string, coachGroupId: string) {
  const { data: assignments, error: assignmentError } = await admin.from("case_assignments").select("id").eq("counseling_case_id", caseId).eq("assignment_type", "coach").eq("assigned_group_id", coachGroupId).is("ended_at", null);
  failIfError(assignmentError, "Unable to read DEV test counseling case assignment");
  const activeAssignments = assignments ?? [];
  if (activeAssignments.length > 1) throw new Error("Duplicate active DEV test Coach assignments found");
  if (activeAssignments[0]) return;

  const adminClient = createPublicClient(url, publishableKey);
  const { error: signInError } = await adminClient.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  failIfError(signInError, "Unable to sign in the DEV Admin test user");
  const { error } = await adminClient.rpc("assign_counseling_case", { target_case_id: caseId, target_group_id: coachGroupId, target_assignment_type: "coach", reassignment_reason: "DEV test-user setup" });
  failIfError(error, "Unable to assign the DEV test counseling case");
}

async function setup() {
  const configuration = getConfiguration();
  const admin = createAdminClient(configuration.url, configuration.secretKey);
  const ids = await ensureAuthUsers(admin, configuration.users);
  const campus = await ensureCampus(admin);
  await ensureProfilesAndRoles(admin, configuration.users, ids, campus);
  const couple = await ensureGroup(admin, campus, "couple", "DEV Test Couple");
  const coach = await ensureGroup(admin, campus, "coach_team", "DEV Test Coach Team");
  const counselor = await ensureGroup(admin, campus, "counselor_team", "DEV Test Counselor Team");
  await Promise.all([ensureMembership(admin, couple, ids.couple1), ensureMembership(admin, couple, ids.couple2), ensureMembership(admin, coach, ids.coach), ensureMembership(admin, coach, ids.coach2), ensureMembership(admin, counselor, ids.counselor), ensureMembership(admin, counselor, ids.counselor2)]);
  const caseId = await ensureCase(admin, { campus, couple, coach, counselor }, ids);
  const adminUser = configuration.users.find((user) => user.key === "admin")!;
  await ensureAssignment(admin, configuration.url, configuration.publishableKey, adminUser.emailAddress, adminUser.passwordValue, caseId, coach);
  console.log("DEV test-user setup completed.");
}

async function verifyRls(url: string, publishableKey: string, users: ReturnType<typeof getConfiguration>["users"]) {
  const privilegedCounts: number[] = [];
  for (const user of users) {
    const client = createPublicClient(url, publishableKey);
    const { error: signInError } = await client.auth.signInWithPassword({ email: user.emailAddress, password: user.passwordValue });
    failIfError(signInError, `Unable to sign in ${user.key} for RLS verification`);
    const { count, error } = await client.from("profiles").select("id", { count: "exact", head: true });
    failIfError(error, `Unable to verify profile access for ${user.key}`);
    if (user.roles.includes("super_admin") || user.roles.includes("admin")) privilegedCounts.push(count ?? 0);
    else if ((count ?? 0) >= Math.max(...privilegedCounts)) throw new Error(`${user.key} unexpectedly has organization-wide People access`);
  }
}

async function readRequiredCampus(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.from("campuses").select("id").eq("code", TEST_CAMPUS.code);
  failIfError(error, "Unable to verify the DEV test campus");
  const campuses = data ?? [];
  if (campuses.length !== 1) throw new Error("DEV test campus is missing or duplicated");
  return campuses[0].id;
}

async function readRequiredGroup(admin: ReturnType<typeof createAdminClient>, groupType: Database["public"]["Enums"]["group_type"], name: string) {
  const { data, error } = await admin.from("groups").select("id").eq("group_type", groupType).eq("name", name);
  failIfError(error, `Unable to verify ${name}`);
  const groups = data ?? [];
  if (groups.length !== 1) throw new Error(`${name} is missing or duplicated`);
  return groups[0].id;
}

async function verifyMemberships(admin: ReturnType<typeof createAdminClient>, groupId: string, profileIds: string[]) {
  const { data, error } = await admin.from("group_members").select("profile_id").eq("group_id", groupId).is("ended_at", null);
  failIfError(error, "Unable to verify DEV test group memberships");
  const memberships = data ?? [];
  if (memberships.length !== profileIds.length || memberships.some((membership) => !profileIds.includes(membership.profile_id))) {
    throw new Error("DEV test group memberships are incomplete or duplicated");
  }
}

async function verify() {
  const configuration = getConfiguration();
  const admin = createAdminClient(configuration.url, configuration.secretKey);
  const existing = await findAuthUsers(admin);
  const ids = {} as TestUserIds;
  for (const user of configuration.users) {
    const authUser = existing.get(user.emailAddress);
    if (!authUser) throw new Error(`Missing Auth user for ${user.key}`);
    ids[user.key] = authUser.id;
  }
  const { data: profiles, error: profileError } = await admin.from("profiles").select("id, email, status").in("id", Object.values(ids));
  failIfError(profileError, "Unable to verify DEV test profiles");
  const expectedProfiles = profiles ?? [];
  if (expectedProfiles.length !== testUsers.length || expectedProfiles.some((profile) => profile.status !== "active")) throw new Error("DEV test profiles are incomplete or inactive");
  for (const user of configuration.users) if (!expectedProfiles.some((profile) => profile.id === ids[user.key] && profile.email === user.emailAddress)) throw new Error(`Profile email does not match Auth user for ${user.key}`);
  const { data: roles, error: roleError } = await admin.from("profile_roles").select("profile_id, role").in("profile_id", Object.values(ids));
  failIfError(roleError, "Unable to verify DEV test roles");
  for (const user of configuration.users) {
    const userRoles = (roles ?? []).filter((role) => role.profile_id === ids[user.key]);
    const expectedRoles = new Set(user.roles);
    if (userRoles.length !== expectedRoles.size || new Set(userRoles.map((role) => role.role)).size !== expectedRoles.size || userRoles.some((role) => !expectedRoles.has(role.role))) {
      throw new Error(`Unexpected role assignments for ${user.key}`);
    }
  }
  await readRequiredCampus(admin);
  const couple = await readRequiredGroup(admin, "couple", "DEV Test Couple");
  const coach = await readRequiredGroup(admin, "coach_team", "DEV Test Coach Team");
  await Promise.all([verifyMemberships(admin, couple, [ids.couple1, ids.couple2]), verifyMemberships(admin, coach, [ids.coach, ids.coach2]), verifyMemberships(admin, await readRequiredGroup(admin, "counselor_team", "DEV Test Counselor Team"), [ids.counselor, ids.counselor2])]);
  const { data: cases, error: caseError } = await admin.from("counseling_cases").select("id").eq("couple_group_id", couple);
  failIfError(caseError, "Unable to verify DEV test counseling case");
  const testCases = cases ?? [];
  if (testCases.length !== 1) throw new Error("DEV test counseling case is missing or duplicated");
  const caseId = testCases[0].id;
  const { data: assignments, error: assignmentError } = await admin.from("case_assignments").select("id").eq("counseling_case_id", caseId).eq("assigned_group_id", coach).eq("assignment_type", "coach").is("ended_at", null);
  failIfError(assignmentError, "Unable to verify DEV test case assignment");
  if ((assignments ?? []).length !== 1) throw new Error("DEV test counseling case does not have one active Coach assignment");
  await verifyRls(configuration.url, configuration.publishableKey, configuration.users);
  console.log("DEV test users and role access verified.");
}

const mode = process.argv[2];
if (mode === "setup") await setup();
else if (mode === "verify") await verify();
else throw new Error("Usage: scripts/test-users.ts <setup|verify>");
