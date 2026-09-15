import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const TEST_CAMPUS = { name: "Test Campus", code: "DEV_TEST" };

type TestRole = Database["public"]["Enums"]["app_role"];
type FixtureRole = TestRole | "campus_lead";
type PendingInvitationClient = {
  from(name: "invitations"): {
    select(columns: "id,auth_user_id"): {
      eq(column: "group_id", value: string): {
        eq(column: "status", value: "pending"): {
          eq(column: "intended_role", value: TestRole): Promise<{ data: { id: string; auth_user_id: string | null }[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
};
type TestUser = {
  key: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: readonly FixtureRole[];
};

const testUsers: readonly TestUser[] = [
  { key: "superAdmin", email: "TEST_SUPER_ADMIN_EMAIL", password: "TEST_SUPER_ADMIN_PASSWORD", firstName: "Test", lastName: "Super Admin", roles: ["super_admin"] },
  { key: "admin", email: "TEST_ADMIN_EMAIL", password: "TEST_ADMIN_PASSWORD", firstName: "Test", lastName: "Admin", roles: ["admin"] },
  { key: "coach", email: "TEST_COACH_EMAIL", password: "TEST_COACH_PASSWORD", firstName: "Test", lastName: "Coach", roles: ["coach"] },
  { key: "coach2", email: "TEST_COACH_2_EMAIL", password: "TEST_COACH_2_PASSWORD", firstName: "Test", lastName: "Coach Two", roles: ["coach"] },
  { key: "coach3", email: "TEST_COACH_3_EMAIL", password: "TEST_COACH_3_PASSWORD", firstName: "Test", lastName: "Coach Three", roles: ["coach"] },
  { key: "counselor", email: "TEST_COUNSELOR_EMAIL", password: "TEST_COUNSELOR_PASSWORD", firstName: "Test", lastName: "Counselor", roles: ["counselor"] },
  { key: "counselor2", email: "TEST_COUNSELOR_2_EMAIL", password: "TEST_COUNSELOR_2_PASSWORD", firstName: "Test", lastName: "Counselor Two", roles: ["counselor"] },
  { key: "couple1", email: "TEST_COUPLE_1_EMAIL", password: "TEST_COUPLE_1_PASSWORD", firstName: "Test", lastName: "Couple One", roles: ["couple"] },
  { key: "couple2", email: "TEST_COUPLE_2_EMAIL", password: "TEST_COUPLE_2_PASSWORD", firstName: "Test", lastName: "Couple Two", roles: ["couple"] },
  { key: "author", email: "TEST_AUTHOR_EMAIL", password: "TEST_AUTHOR_PASSWORD", firstName: "Test", lastName: "Author", roles: ["author"] },
  { key: "multiRole", email: "TEST_MULTIROLE_EMAIL", password: "TEST_MULTIROLE_PASSWORD", firstName: "Test", lastName: "Multi Role", roles: ["super_admin", "coach"] },
  { key: "campusLead", email: "TEST_CAMPUS_LEAD_EMAIL", password: "TEST_CAMPUS_LEAD_PASSWORD", firstName: "Test", lastName: "Campus Lead", roles: ["campus_lead"] },
  { key: "campusLead2", email: "TEST_CAMPUS_LEAD_2_EMAIL", password: "TEST_CAMPUS_LEAD_2_PASSWORD", firstName: "Test", lastName: "Campus Lead Two", roles: ["campus_lead"] },
] as const;

type TestUserKey = TestUser["key"];
type TestUserIds = Record<TestUserKey, string>;
type FixtureIds = { campus: string; couple: string; coach: string; coach2: string; counselor: string; campusLead: string; case: string };

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
    const { error: passwordError } = await admin.auth.admin.updateUserById(authUser.id, { password: user.passwordValue, email_confirm: true });
    failIfError(passwordError, `Unable to set the DEV test password for ${user.key}`);
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
    const expectedRoles = new Set<FixtureRole>(user.roles);
    for (const existingRole of existingRoles ?? []) {
      if (expectedRoles.has(existingRole.role)) continue;
      const { error: cleanupError } = await admin.from("profile_roles").delete().eq("profile_id", ids[user.key]).eq("role", existingRole.role);
      failIfError(cleanupError, `Unable to clear unexpected role for ${user.key}`);
    }
    for (const role of expectedRoles) {
      const { error: roleError } = await admin.from("profile_roles" as never).upsert({ profile_id: ids[user.key], role, assigned_by: ids.superAdmin } as never, { onConflict: "profile_id,role" });
      failIfError(roleError, `Unable to assign ${role} role for ${user.key}`);
    }
  }
}

async function ensureCompletedTestCoupleOnboarding(admin: ReturnType<typeof createAdminClient>, ids: TestUserIds) {
  const profiles = admin as unknown as { from: (table: "profiles") => { update(values: Record<string, unknown>): { in(column: string, values: string[]): Promise<{ error: { message: string } | null }> } } };
  const { error } = await profiles.from("profiles").update({ status: "active", onboarding_completed_at: "2026-01-01T00:00:00.000Z" }).in("id", [ids.couple1, ids.couple2]);
  failIfError(error, "Unable to ensure completed onboarding for the DEV test Couple");
}

async function ensureCampusLeadAssignments(admin: ReturnType<typeof createAdminClient>, users: ReturnType<typeof getConfiguration>["users"], ids: TestUserIds, campusId: string) {
  for (const user of users.filter((candidate) => candidate.roles.includes("campus_lead"))) {
    const assignments = await admin.from("campus_lead_assignments" as never).select("id,campus_id").eq("profile_id", ids[user.key]).is("ended_at", null);
    failIfError(assignments.error, `Unable to read Campus Lead scope for ${user.key}`);
    const activeAssignments = (assignments.data ?? []) as unknown as Array<{ id: string; campus_id: string }>;
    for (const assignment of activeAssignments.filter((assignment) => assignment.campus_id !== campusId)) {
      const { error } = await admin.from("campus_lead_assignments" as never).update({ ended_at: new Date().toISOString() } as never).eq("id", assignment.id);
      failIfError(error, `Unable to end unexpected Campus Lead scope for ${user.key}`);
    }
    if (activeAssignments.filter((assignment) => assignment.campus_id === campusId).length === 1) continue;
    if (activeAssignments.filter((assignment) => assignment.campus_id === campusId).length > 1) throw new Error(`Duplicate active Campus Lead scopes found for ${user.key}`);
    const { error: removeRoleError } = await admin.from("profile_roles").delete().eq("profile_id", ids[user.key]).eq("role", "campus_lead" as TestRole);
    failIfError(removeRoleError, `Unable to repair Campus Lead role for ${user.key}`);
    const { error: restoreRoleError } = await admin.from("profile_roles" as never).insert({ profile_id: ids[user.key], role: "campus_lead", assigned_by: ids.superAdmin } as never);
    failIfError(restoreRoleError, `Unable to repair Campus Lead scope for ${user.key}`);
  }
}

type FixtureGroupType = Database["public"]["Enums"]["group_type"] | "campus_lead_team";

async function ensureGroup(admin: ReturnType<typeof createAdminClient>, campusId: string, groupType: FixtureGroupType, name: string) {
  const generatedGroupType = groupType as Database["public"]["Enums"]["group_type"];
  const { data, error } = await admin.from("groups").select("id").eq("group_type", generatedGroupType).eq("name", name);
  failIfError(error, `Unable to read ${name}`);
  const groups = data ?? [];
  if (groups.length > 1) throw new Error(`Duplicate ${name} groups found`);
  if (groups[0]) return groups[0].id;
  const { data: group, error: insertError } = await admin.from("groups").insert({ campus_id: campusId, group_type: generatedGroupType, name }).select("id").single();
  failIfError(insertError, `Unable to create ${name}`);
  if (!group) throw new Error(`Unable to create ${name}`);
  return group.id;
}

async function ensureMemberships(admin: ReturnType<typeof createAdminClient>, groupId: string, profileIds: string[]) {
  const { data, error } = await admin.from("group_members").select("id, profile_id").eq("group_id", groupId).is("ended_at", null);
  failIfError(error, "Unable to read DEV test group membership");
  const memberships = data ?? [];
  for (const membership of memberships) {
    if (profileIds.includes(membership.profile_id)) continue;
    const { error: endError } = await admin.from("group_members").update({ ended_at: new Date().toISOString() }).eq("id", membership.id);
    failIfError(endError, "Unable to end an outdated DEV test group membership");
  }
  for (const profileId of profileIds) {
    if (memberships.some((membership) => membership.profile_id === profileId)) continue;
    const { error: insertError } = await admin.from("group_members").insert({ group_id: groupId, profile_id: profileId });
    failIfError(insertError, "Unable to create DEV test group membership");
  }
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
  await ensureCompletedTestCoupleOnboarding(admin, ids);
  await ensureCampusLeadAssignments(admin, configuration.users, ids, campus);
  const couple = await ensureGroup(admin, campus, "couple", "DEV Test Couple");
  const coach = await ensureGroup(admin, campus, "coach_team", "DEV Test Coach Team");
  const coach2 = await ensureGroup(admin, campus, "coach_team", "DEV Test Coach Team Two");
  const counselor = await ensureGroup(admin, campus, "counselor_team", "DEV Test Counselor Team");
  const campusLead = await ensureGroup(admin, campus, "campus_lead_team", "DEV Test Campus Lead Team");
  await Promise.all([ensureMemberships(admin, couple, [ids.couple1, ids.couple2]), ensureMemberships(admin, coach, [ids.coach, ids.coach2]), ensureMemberships(admin, coach2, [ids.multiRole, ids.coach3]), ensureMemberships(admin, counselor, [ids.counselor, ids.counselor2]), ensureMemberships(admin, campusLead, [ids.campusLead, ids.campusLead2])]);
  const caseId = await ensureCase(admin, { campus, couple, coach, coach2, counselor, campusLead }, ids);
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

async function readRequiredGroup(admin: ReturnType<typeof createAdminClient>, groupType: FixtureGroupType, name: string) {
  const { data, error } = await admin.from("groups").select("id").eq("group_type", groupType as Database["public"]["Enums"]["group_type"]).eq("name", name);
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

async function verifyTeamShapes(admin: ReturnType<typeof createAdminClient>, groupType: FixtureGroupType, requiredRole: FixtureRole) {
  const { data: groups, error: groupsError } = await admin.from("groups").select("id, name").eq("group_type", groupType as Database["public"]["Enums"]["group_type"]).eq("active", true);
  failIfError(groupsError, `Unable to verify active ${groupType} teams`);
  for (const group of groups ?? []) {
    const { data: memberships, error: membershipsError } = await admin.from("group_members").select("profile_id").eq("group_id", group.id).is("ended_at", null);
    failIfError(membershipsError, `Unable to verify members for ${group.name}`);
    const establishedMembers = memberships ?? [];
    const { data: pendingInvitations, error: invitationsError } = await (admin as unknown as PendingInvitationClient).from("invitations").select("id,auth_user_id").eq("group_id", group.id).eq("status", "pending").eq("intended_role", requiredRole as TestRole);
    failIfError(invitationsError, `Unable to verify pending invitations for ${group.name}`);
    const pendingMembers = pendingInvitations ?? [];
    const profileIds = establishedMembers.map((membership) => membership.profile_id);
    if (establishedMembers.length + pendingMembers.length !== 2 || pendingMembers.some((invitation) => invitation.auth_user_id !== null && profileIds.includes(invitation.auth_user_id))) {
      throw new Error(`${group.name} must resolve to exactly 2 distinct established or pending members`);
    }
    if (establishedMembers.length === 0) continue;
    const { data: roles, error: rolesError } = await admin.from("profile_roles").select("profile_id, role").in("profile_id", profileIds).eq("role", requiredRole as TestRole);
    failIfError(rolesError, `Unable to verify ${requiredRole} roles for ${group.name}`);
    if (new Set((roles ?? []).map((role) => role.profile_id)).size !== establishedMembers.length) throw new Error(`${group.name} must contain ${establishedMembers.length} active members with the ${requiredRole} role`);
  }
}

async function verifyCoachMembershipUniqueness(admin: ReturnType<typeof createAdminClient>) {
  const { data: teams, error: teamsError } = await admin.from("groups").select("id").eq("group_type", "coach_team").eq("active", true);
  failIfError(teamsError, "Unable to verify active Coach teams");
  const profileTeamCounts = new Map<string, number>();
  for (const team of teams ?? []) {
    const { data: memberships, error: membershipsError } = await admin.from("group_members").select("profile_id").eq("group_id", team.id).is("ended_at", null);
    failIfError(membershipsError, "Unable to verify active Coach memberships");
    for (const membership of memberships ?? []) profileTeamCounts.set(membership.profile_id, (profileTeamCounts.get(membership.profile_id) ?? 0) + 1);
  }
  const duplicates = [...profileTeamCounts.entries()].filter(([, teamCount]) => teamCount > 1);
  if (duplicates.length) throw new Error("A Coach profile belongs to more than one active Coach team");
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
    const expectedRoles = new Set<FixtureRole>(user.roles);
    if (userRoles.length !== expectedRoles.size || new Set(userRoles.map((role) => role.role)).size !== expectedRoles.size || userRoles.some((role) => !expectedRoles.has(role.role))) {
      throw new Error(`Unexpected role assignments for ${user.key}`);
    }
  }
  await readRequiredCampus(admin);
  const couple = await readRequiredGroup(admin, "couple", "DEV Test Couple");
  const profileReader = admin as unknown as { from: (table: "profiles") => { select(columns: string): { in(column: string, values: string[]): Promise<{ data: Array<{ id: string; status: string; onboarding_completed_at: string | null }> | null; error: { message: string } | null }> } } };
  const { data: coupleProfiles, error: coupleProfilesError } = await profileReader.from("profiles").select("id,status,onboarding_completed_at").in("id", [ids.couple1, ids.couple2]);
  failIfError(coupleProfilesError, "Unable to verify completed onboarding for the DEV test Couple");
  if ((coupleProfiles ?? []).length !== 2 || (coupleProfiles ?? []).some((profile) => profile.status !== "active" || !profile.onboarding_completed_at)) throw new Error("DEV test Couple members must have active profiles with completed onboarding");
  const coach = await readRequiredGroup(admin, "coach_team", "DEV Test Coach Team");
  const coach2 = await readRequiredGroup(admin, "coach_team", "DEV Test Coach Team Two");
  const campusLead = await readRequiredGroup(admin, "campus_lead_team", "DEV Test Campus Lead Team");
  await Promise.all([verifyMemberships(admin, couple, [ids.couple1, ids.couple2]), verifyMemberships(admin, coach, [ids.coach, ids.coach2]), verifyMemberships(admin, coach2, [ids.multiRole, ids.coach3]), verifyMemberships(admin, await readRequiredGroup(admin, "counselor_team", "DEV Test Counselor Team"), [ids.counselor, ids.counselor2]), verifyMemberships(admin, campusLead, [ids.campusLead, ids.campusLead2])]);
  const campus = await readRequiredCampus(admin);
  for (const user of configuration.users.filter((candidate) => candidate.roles.includes("campus_lead"))) {
    const scope = await admin.from("campus_lead_assignments" as never).select("campus_id").eq("profile_id", ids[user.key]).is("ended_at", null);
    failIfError(scope.error, `Unable to verify Campus Lead scope for ${user.key}`);
    const activeScopes = (scope.data ?? []) as unknown as Array<{ campus_id: string }>;
    if (activeScopes.length !== 1 || activeScopes[0]?.campus_id !== campus) throw new Error(`${user.key} must have exactly one active Campus Lead scope for the DEV test campus`);
  }
  await Promise.all([verifyTeamShapes(admin, "couple", "couple"), verifyTeamShapes(admin, "coach_team", "coach"), verifyTeamShapes(admin, "counselor_team", "counselor"), verifyTeamShapes(admin, "campus_lead_team", "campus_lead"), verifyCoachMembershipUniqueness(admin)]);
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
