import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const CAMPUS_CODE = "DEV_TEST";
const FIXTURE_NAME = "DEV — C2 Final Realtime Verification";
const COUNSELOR_TEAM_NAME = "DEV — Realtime Session & Case Counselor Team";
const PARTNER_A_EMAIL = "phase3d-c2-final-a@mailinator.com";
const PARTNER_B_EMAIL = "phase3d-c2-final-b@mailinator.com";
const PRESERVED_CASE_IDS = [
  "356a285c-172c-4bb3-877d-800922906628",
  "1bc549ee-5c8e-4037-84d6-bdc3c295837b",
] as const;

type Client = SupabaseClient<Database>;
type PartnerKey = "partnerA" | "partnerB";
type Partner = {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  passwordEnv: string;
};
type Mode = "create" | "resume-case" | "verify";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function configuration() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("Final Realtime fixture setup refused: configured Supabase project is not approved DEV.");
  }
  return {
    url,
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    secretKey: required("SUPABASE_SECRET_KEY"),
    adminEmail: required("TEST_ADMIN_EMAIL").toLowerCase(),
    adminPassword: required("TEST_ADMIN_PASSWORD"),
    counselorOneEmail: required("PHASE3D_C2_COUNSELOR_1_EMAIL").toLowerCase(),
    counselorOnePassword: required("PHASE3D_C2_COUNSELOR_1_PASSWORD"),
    counselorTwoEmail: required("PHASE3D_C2_COUNSELOR_2_EMAIL").toLowerCase(),
    partnerAPassword: required("PHASE3D_C2_PROGRESSION_PARTNER_A_PASSWORD"),
    partnerBPassword: required("PHASE3D_C2_PROGRESSION_PARTNER_B_PASSWORD"),
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

async function preservedCaseSnapshot(admin: Client) {
  const cases = await admin
    .from("counseling_cases")
    .select("id,status,closed_at,updated_at")
    .in("id", [...PRESERVED_CASE_IDS])
    .order("id");
  fail(cases.error, "Unable to snapshot preserved C2 Cases");
  if (cases.data?.length !== PRESERVED_CASE_IDS.length) throw new Error("A preserved C2 Case is missing");

  return Promise.all(cases.data.map(async (counselingCase) => {
    const [sessions, meetings, homework, deliveries, assignments] = await Promise.all([
      admin.from("case_sessions").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("case_session_meetings").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("homework_assignments").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
      admin.from("case_assignments").select("id", { count: "exact", head: true }).eq("counseling_case_id", counselingCase.id),
    ]);
    for (const [label, result] of Object.entries({ sessions, meetings, homework, deliveries, assignments })) {
      fail(result.error, `Unable to snapshot preserved C2 Case ${label}`);
    }
    return {
      ...counselingCase,
      sessions: sessions.count,
      meetings: meetings.count,
      homework: homework.count,
      deliveries: deliveries.count,
      assignments: assignments.count,
    };
  }));
}

async function preflight(admin: Client, config: ReturnType<typeof configuration>) {
  const authUsers = await listAuthUsers(admin);
  const targetEmails = [PARTNER_A_EMAIL, PARTNER_B_EMAIL];
  const partnerAuth = targetEmails.map((email) => authUsers.filter((user) => user.email?.toLowerCase() === email));
  if (partnerAuth.some((matches) => matches.length > 1)) throw new Error("Duplicate final-verification Auth identity detected");

  const [campuses, groups, profiles, counselorGroup, sessions] = await Promise.all([
    admin.from("campuses").select("id,name,code,active").eq("code", CAMPUS_CODE),
    admin.from("groups").select("id,campus_id,active").eq("group_type", "couple").eq("name", FIXTURE_NAME),
    admin.from("profiles").select("id,email").in("email", targetEmails),
    admin.from("groups").select("id,campus_id,active").eq("group_type", "counselor_team").eq("name", COUNSELOR_TEAM_NAME),
    admin.from("sessions").select("id,title,status,is_final,sequence_number").eq("title", "testing"),
  ]);
  for (const [label, result] of Object.entries({ campuses, groups, profiles, counselorGroup, sessions })) {
    fail(result.error, `Unable to inspect final-verification ${label}`);
  }
  if (campuses.data?.length !== 1 || !campuses.data[0].active) throw new Error("Expected exactly one active DEV_TEST Campus");
  if (counselorGroup.data?.length !== 1 || !counselorGroup.data[0].active) throw new Error("Expected the existing active C2 Counselor team");
  if (counselorGroup.data[0].campus_id !== campuses.data[0].id) throw new Error("C2 Counselor team is outside the expected DEV Campus");

  const counselorMatches = [config.counselorOneEmail, config.counselorTwoEmail].map((email) =>
    authUsers.filter((user) => user.email?.toLowerCase() === email),
  );
  if (counselorMatches.some((matches) => matches.length !== 1)) throw new Error("Expected both existing C2 Counselor Auth identities");
  const counselorIds = counselorMatches.map((matches) => matches[0].id).sort();
  const counselorMembers = await admin.from("group_members").select("profile_id").eq("group_id", counselorGroup.data[0].id).is("ended_at", null);
  fail(counselorMembers.error, "Unable to inspect C2 Counselor team membership");
  if (JSON.stringify((counselorMembers.data ?? []).map(({ profile_id }) => profile_id).sort()) !== JSON.stringify(counselorIds)) {
    throw new Error("Existing C2 Counselor team membership does not match its two configured identities");
  }

  const testing = sessions.data?.find((session) => session.status === "published" && !session.is_final);
  if (!testing) throw new Error("Published non-final Session 'testing' is unavailable");
  const material = await admin.from("session_material_blocks").select("id", { count: "exact", head: true }).eq("session_id", testing.id);
  fail(material.error, "Unable to inspect published Material for Session 'testing'");
  if (!material.count) throw new Error("Published Session 'testing' has no Material");

  const authCount = partnerAuth.filter((matches) => matches.length === 1).length;
  const groupCount = groups.data?.length ?? 0;
  if (authCount === 0 && groupCount === 0 && profiles.data?.length === 0) {
    return {
      mode: "create" as Mode,
      authUsers,
      campus: campuses.data[0],
      counselorGroupId: counselorGroup.data[0].id,
      counselorOneId: counselorMatches[0][0].id,
      testing,
    };
  }
  if (authCount !== 2 || groupCount !== 1 || profiles.data?.length !== 2) {
    throw new Error("Partial or colliding final-verification fixture detected; refusing to repair or overwrite it");
  }
  const group = groups.data![0];
  if (!group.active || group.campus_id !== campuses.data[0].id) throw new Error("Existing final-verification Couple group is inactive or outside DEV_TEST");
  const cases = await admin.from("counseling_cases").select("id").eq("couple_group_id", group.id);
  fail(cases.error, "Unable to inspect existing final-verification Cases");
  if ((cases.data?.length ?? 0) > 1) throw new Error("Duplicate final-verification Cases detected");
  return {
    mode: (cases.data?.length === 0 ? "resume-case" : "verify") as Mode,
    authUsers,
    campus: campuses.data[0],
    counselorGroupId: counselorGroup.data[0].id,
    counselorOneId: counselorMatches[0][0].id,
    testing,
    groupId: group.id,
  };
}

async function createPartners(admin: Client, config: ReturnType<typeof configuration>, adminId: string) {
  const definitions = {
    partnerA: { email: PARTNER_A_EMAIL, password: config.partnerAPassword, firstName: "Final Realtime", lastName: "Partner A", passwordEnv: "PHASE3D_C2_PROGRESSION_PARTNER_A_PASSWORD" },
    partnerB: { email: PARTNER_B_EMAIL, password: config.partnerBPassword, firstName: "Final Realtime", lastName: "Partner B", passwordEnv: "PHASE3D_C2_PROGRESSION_PARTNER_B_PASSWORD" },
  } as const;
  const partners = {} as Record<PartnerKey, Partner>;
  for (const [key, definition] of Object.entries(definitions) as Array<[PartnerKey, typeof definitions[PartnerKey]]>) {
    const created = await admin.auth.admin.createUser({ email: definition.email, password: definition.password, email_confirm: true });
    fail(created.error, `Unable to create ${definition.email}`);
    if (!created.data.user) throw new Error(`Created Auth identity missing for ${definition.email}`);

    const triggerProfile = await admin.from("profiles").select("id,email").eq("id", created.data.user.id).maybeSingle();
    fail(triggerProfile.error, `Unable to inspect Auth-trigger profile for ${definition.email}`);
    if (triggerProfile.data?.email?.toLowerCase() !== definition.email) throw new Error(`Auth-trigger profile mismatch for ${definition.email}`);
    const profile = await admin.from("profiles").update({
      campus_id: null,
      first_name: definition.firstName,
      last_name: definition.lastName,
      status: "active",
      onboarding_completed_at: new Date().toISOString(),
    }).eq("id", created.data.user.id);
    fail(profile.error, `Unable to complete profile for ${definition.email}`);
    const role = await admin.from("profile_roles").insert({ profile_id: created.data.user.id, role: "couple", assigned_by: adminId });
    fail(role.error, `Unable to assign Couple role for ${definition.email}`);
    partners[key] = { ...definition, id: created.data.user.id };
  }
  return partners;
}

async function existingPartners(admin: Client, config: ReturnType<typeof configuration>, authUsers: Awaited<ReturnType<typeof listAuthUsers>>) {
  const definitions = {
    partnerA: { email: PARTNER_A_EMAIL, password: config.partnerAPassword, firstName: "Final Realtime", lastName: "Partner A", passwordEnv: "PHASE3D_C2_PROGRESSION_PARTNER_A_PASSWORD" },
    partnerB: { email: PARTNER_B_EMAIL, password: config.partnerBPassword, firstName: "Final Realtime", lastName: "Partner B", passwordEnv: "PHASE3D_C2_PROGRESSION_PARTNER_B_PASSWORD" },
  } as const;
  const partners = {} as Record<PartnerKey, Partner>;
  for (const [key, definition] of Object.entries(definitions) as Array<[PartnerKey, typeof definitions[PartnerKey]]>) {
    const authUser = authUsers.find((user) => user.email?.toLowerCase() === definition.email);
    if (!authUser || !authUser.email_confirmed_at) throw new Error(`Existing Auth identity is missing or unconfirmed for ${definition.email}`);
    const profile = await admin.from("profiles").select("id,email,first_name,last_name,status").eq("id", authUser.id).maybeSingle();
    fail(profile.error, `Unable to inspect existing profile for ${definition.email}`);
    if (
      profile.data?.email?.toLowerCase() !== definition.email ||
      profile.data.first_name !== definition.firstName ||
      profile.data.last_name !== definition.lastName ||
      profile.data.status !== "active"
    ) throw new Error(`Existing profile no longer matches the final-verification fixture contract for ${definition.email}`);
    partners[key] = { ...definition, id: authUser.id };
  }
  return partners;
}

async function createFixtureRecords(
  admin: Client,
  config: ReturnType<typeof configuration>,
  campusId: string,
  adminId: string,
  counselorGroupId: string,
  partners: Record<PartnerKey, Partner>,
  existingGroupId?: string,
) {
  let groupId = existingGroupId;
  if (groupId) {
    const [members, roles] = await Promise.all([
      admin.from("group_members").select("profile_id").eq("group_id", groupId).is("ended_at", null),
      admin.from("profile_roles").select("profile_id,role").in("profile_id", Object.values(partners).map(({ id }) => id)),
    ]);
    fail(members.error, "Unable to inspect resumable final-verification memberships");
    fail(roles.error, "Unable to inspect resumable final-verification roles");
    const expectedIds = Object.values(partners).map(({ id }) => id).sort();
    if (JSON.stringify((members.data ?? []).map(({ profile_id }) => profile_id).sort()) !== JSON.stringify(expectedIds)) {
      throw new Error("Resumable final-verification Couple membership is incomplete or changed");
    }
    if (roles.data?.length !== 2 || roles.data.some(({ profile_id, role }) => role !== "couple" || !expectedIds.includes(profile_id))) {
      throw new Error("Resumable final-verification Couple roles are incomplete or changed");
    }
  } else {
    const group = await admin.from("groups").insert({ campus_id: campusId, group_type: "couple", name: FIXTURE_NAME }).select("id").single();
    fail(group.error, "Unable to create final-verification Couple group");
    if (!group.data) throw new Error("Created final-verification Couple group is missing");
    groupId = group.data.id;
    const members = await admin.from("group_members").insert(Object.values(partners).map((partner) => ({ group_id: groupId!, profile_id: partner.id })));
    fail(members.error, "Unable to create final-verification Couple memberships");
  }

  const counselingCase = await admin.from("counseling_cases").insert({
    campus_id: campusId,
    couple_group_id: groupId,
    created_by: adminId,
    status: "active",
  }).select("id").single();
  fail(counselingCase.error, "Unable to create final-verification Counseling Case");
  if (!counselingCase.data) throw new Error("Created final-verification Counseling Case is missing");

  const adminActor = publicClient(config.url, config.publishableKey);
  const adminAuth = await adminActor.auth.signInWithPassword({ email: config.adminEmail, password: config.adminPassword });
  fail(adminAuth.error, "Unable to authenticate DEV Admin for final-verification assignment");
  const assignment = await adminActor.rpc("assign_counseling_case", {
    target_case_id: counselingCase.data.id,
    target_group_id: counselorGroupId,
    target_assignment_type: "counselor",
    reassignment_reason: "Dedicated Phase 3D-C2 final Realtime verification fixture",
  });
  await adminActor.auth.signOut();
  fail(assignment.error, "Unable to assign the existing C2 Counselor team");
  if (!assignment.data) throw new Error("Created final-verification Counselor assignment is missing");

  const counselor = publicClient(config.url, config.publishableKey);
  const counselorAuth = await counselor.auth.signInWithPassword({ email: config.counselorOneEmail, password: config.counselorOnePassword });
  fail(counselorAuth.error, "Unable to authenticate existing C2 Counselor One");
  const startsAt = new Date(Date.now() + 5 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const meeting = await counselor.rpc("schedule_initial_case_meeting", {
    target_case_id: counselingCase.data.id,
    target_starts_at: startsAt.toISOString(),
    target_ends_at: endsAt.toISOString(),
  });
  await counselor.auth.signOut();
  fail(meeting.error, "Unable to schedule the final-verification Initial Meeting");
  if (!meeting.data) throw new Error("Created final-verification Initial Meeting is missing");
  return { groupId: groupId!, caseId: counselingCase.data.id, assignmentId: assignment.data, meetingId: meeting.data };
}

async function resolveExistingFixture(admin: Client, groupId: string) {
  const cases = await admin.from("counseling_cases").select("id").eq("couple_group_id", groupId);
  fail(cases.error, "Unable to inspect existing final-verification Case");
  if (cases.data?.length !== 1) throw new Error("Expected exactly one existing final-verification Case");
  const assignments = await admin.from("case_assignments").select("id,assigned_group_id,assignment_type").eq("counseling_case_id", cases.data[0].id).is("ended_at", null);
  fail(assignments.error, "Unable to inspect existing final-verification assignment");
  if (assignments.data?.length !== 1) throw new Error("Expected exactly one active final-verification assignment");
  const meetings = await admin.from("case_session_meetings").select("id,session_id,completed_at").eq("counseling_case_id", cases.data[0].id).is("session_id", null);
  fail(meetings.error, "Unable to inspect existing final-verification Initial Meeting");
  if (meetings.data?.length !== 1) throw new Error("Expected exactly one final-verification Initial Meeting");
  return { groupId, caseId: cases.data[0].id, assignmentId: assignments.data[0].id, meetingId: meetings.data[0].id };
}

async function signedInClient(url: string, key: string, email: string, password: string) {
  const client = publicClient(url, key);
  const auth = await client.auth.signInWithPassword({ email, password });
  fail(auth.error, `Unable to authenticate ${email}`);
  return client;
}

async function verifyRealtimeMount(client: Client, caseId: string, label: string) {
  const session = await client.auth.getSession();
  fail(session.error, `Unable to resolve Realtime session for ${label}`);
  const token = session.data.session?.access_token;
  if (!token) throw new Error(`Realtime session is unavailable for ${label}`);
  await client.realtime.setAuth(token);
  const channel = client
    .channel(`c2-final-readiness:${label}:${caseId}`)
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

async function verifyFixture(
  admin: Client,
  config: ReturnType<typeof configuration>,
  fixture: { groupId: string; caseId: string; assignmentId: string; meetingId: string },
  counselorGroupId: string,
  partners: Record<PartnerKey, Partner>,
  requireSessionZero: boolean,
) {
  const [caseResult, members, assignment, meetings, caseSessions, homework, deliveries, invitations] = await Promise.all([
    admin.from("counseling_cases").select("id,status,closed_at,couple_group_id").eq("id", fixture.caseId).single(),
    admin.from("group_members").select("profile_id").eq("group_id", fixture.groupId).is("ended_at", null),
    admin.from("case_assignments").select("id,assigned_group_id,assignment_type").eq("id", fixture.assignmentId).is("ended_at", null).single(),
    admin.from("case_session_meetings").select("id,session_id,case_session_id,starts_at,ends_at,completed_at").eq("counseling_case_id", fixture.caseId).order("created_at"),
    admin.from("case_sessions").select("id,status,title,actual_sequence,template_sequence_number").eq("counseling_case_id", fixture.caseId).order("actual_sequence"),
    admin.from("homework_assignments").select("id", { count: "exact", head: true }).eq("counseling_case_id", fixture.caseId),
    admin.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("counseling_case_id", fixture.caseId),
    admin.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", fixture.groupId),
  ]);
  for (const [label, result] of Object.entries({ caseResult, members, assignment, meetings, caseSessions, homework, deliveries, invitations })) {
    fail(result.error, `Unable to verify final-verification ${label}`);
  }
  if (!caseResult.data || caseResult.data.closed_at || caseResult.data.couple_group_id !== fixture.groupId) throw new Error("Final-verification Case is unavailable or closed");
  const expectedPartners = Object.values(partners).map(({ id }) => id).sort();
  if (JSON.stringify((members.data ?? []).map(({ profile_id }) => profile_id).sort()) !== JSON.stringify(expectedPartners)) throw new Error("Final-verification Couple membership is incomplete");
  if (!assignment.data || assignment.data.assigned_group_id !== counselorGroupId || assignment.data.assignment_type !== "counselor") throw new Error("Final-verification Counselor assignment changed");
  const initialMeeting = meetings.data?.find((meeting) => meeting.id === fixture.meetingId && meeting.session_id === null && meeting.case_session_id === null);
  if (!initialMeeting) throw new Error("Final-verification Initial Meeting is missing");
  if (requireSessionZero) {
    if (caseResult.data.status !== "active" || initialMeeting.completed_at || caseSessions.data?.length || homework.count || deliveries.count || invitations.count) {
      throw new Error("New final-verification fixture is not in the required clean active Session 0 state");
    }
  }

  const clients = {
    counselor: await signedInClient(config.url, config.publishableKey, config.counselorOneEmail, config.counselorOnePassword),
    partnerA: await signedInClient(config.url, config.publishableKey, partners.partnerA.email, partners.partnerA.password),
    partnerB: await signedInClient(config.url, config.publishableKey, partners.partnerB.email, partners.partnerB.password),
  };
  try {
    const [counselorCase, partnerAWorkspace, partnerBWorkspace, counselorRealtime, partnerARealtime, partnerBRealtime] = await Promise.all([
      clients.counselor.from("counseling_cases").select("id").eq("id", fixture.caseId).maybeSingle(),
      clients.partnerA.rpc("get_current_couple_case_team"),
      clients.partnerB.rpc("get_current_couple_case_team"),
      verifyRealtimeMount(clients.counselor, fixture.caseId, "counselor"),
      verifyRealtimeMount(clients.partnerA, fixture.caseId, "partner-a"),
      verifyRealtimeMount(clients.partnerB, fixture.caseId, "partner-b"),
    ]);
    fail(counselorCase.error, "Assigned Counselor cannot read final-verification Case");
    fail(partnerAWorkspace.error, "Partner A cannot resolve final-verification Workspace");
    fail(partnerBWorkspace.error, "Partner B cannot resolve final-verification Workspace");
    if (!counselorCase.data || partnerAWorkspace.data?.[0]?.counseling_case_id !== fixture.caseId || partnerBWorkspace.data?.[0]?.counseling_case_id !== fixture.caseId) {
      throw new Error("Final-verification authorization is incomplete");
    }
    return {
      caseStatus: caseResult.data.status,
      initialMeeting,
      caseSessions: caseSessions.data ?? [],
      lifecycleCounts: { homeworkAssignments: homework.count, notificationDeliveries: deliveries.count, invitations: invitations.count },
      authorization: { counselor: "allowed", partnerA: "allowed", partnerB: "allowed" },
      realtime: { counselor: counselorRealtime, partnerA: partnerARealtime, partnerB: partnerBRealtime },
    };
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
    Object.values(clients).forEach((client) => client.realtime.disconnect());
  }
}

async function run() {
  const config = configuration();
  const admin = createClient<Database>(config.url, config.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const before = await preservedCaseSnapshot(admin);
  const state = await preflight(admin, config);
  const adminIdentity = state.authUsers.find((user) => user.email?.toLowerCase() === config.adminEmail);
  if (!adminIdentity) throw new Error("Configured DEV Admin Auth identity is missing");

  const partners = state.mode === "create"
    ? await createPartners(admin, config, adminIdentity.id)
    : await existingPartners(admin, config, state.authUsers);
  const fixture = state.mode !== "verify"
    ? await createFixtureRecords(admin, config, state.campus.id, adminIdentity.id, state.counselorGroupId, partners, state.mode === "resume-case" ? state.groupId : undefined)
    : await resolveExistingFixture(admin, state.groupId!);
  const verification = await verifyFixture(admin, config, fixture, state.counselorGroupId, partners, state.mode !== "verify");
  const after = await preservedCaseSnapshot(admin);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("An existing C2 fixture changed during final-verification provisioning");

  console.log(JSON.stringify({
    projectRef: DEV_PROJECT_REF,
    mode: state.mode,
    realtimeDisabledByDevSwitch: process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_DISABLE_REALTIME_SUBSCRIPTIONS === "true",
    fixture: { name: FIXTURE_NAME, ...fixture },
    counselor: { teamId: state.counselorGroupId, profileId: state.counselorOneId, email: config.counselorOneEmail, emailEnv: "PHASE3D_C2_COUNSELOR_1_EMAIL", passwordEnv: "PHASE3D_C2_COUNSELOR_1_PASSWORD" },
    partners: Object.fromEntries(Object.entries(partners).map(([key, partner]) => [key, { id: partner.id, email: partner.email, passwordEnv: partner.passwordEnv }])),
    firstPublishedSession: { id: state.testing.id, title: state.testing.title, sequenceNumber: state.testing.sequence_number },
    verification,
    preservedCases: after,
  }, null, 2));
}

await run();
