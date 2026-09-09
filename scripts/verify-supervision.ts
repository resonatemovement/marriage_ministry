import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const SUPERVISION_RPC = "assign_counselor_coach_supervision";

type AuthenticatedClient = ReturnType<typeof createPublicClient>;
type FixtureGroups = { coach: string; coach2: string; counselor: string; couple: string };

function requireEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getConfiguration() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("DEV supervision verification refused: configured Supabase project is not the approved DEV project.");
  }

  return {
    url,
    publishableKey,
    adminEmail: requireEnvironmentVariable("TEST_ADMIN_EMAIL").toLowerCase(),
    adminPassword: requireEnvironmentVariable("TEST_ADMIN_PASSWORD"),
    coachEmail: requireEnvironmentVariable("TEST_COACH_EMAIL").toLowerCase(),
    coachPassword: requireEnvironmentVariable("TEST_COACH_PASSWORD"),
  };
}

function createPublicClient(url: string, publishableKey: string) {
  return createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function failIfError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

async function signIn(url: string, publishableKey: string, email: string, password: string) {
  const client = createPublicClient(url, publishableKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  failIfError(error, `Unable to sign in ${email}`);
  if (!data.session) throw new Error(`No session returned for ${email}`);
  return { client, accessToken: data.session.access_token };
}

async function getFixtureGroups(client: AuthenticatedClient): Promise<FixtureGroups> {
  const names = ["DEV Test Coach Team", "DEV Test Coach Team Two", "DEV Test Counselor Team", "DEV Test Couple"];
  const { data, error } = await client.from("groups").select("id, name").in("name", names).eq("active", true);
  failIfError(error, "Unable to read DEV supervision fixture groups");

  const byName = new Map((data ?? []).map((group) => [group.name, group.id]));
  const fixture = {
    coach: byName.get("DEV Test Coach Team"),
    coach2: byName.get("DEV Test Coach Team Two"),
    counselor: byName.get("DEV Test Counselor Team"),
    couple: byName.get("DEV Test Couple"),
  };
  if (Object.values(fixture).some((id) => !id)) {
    throw new Error("DEV supervision fixture groups are incomplete. Run npm run setup:test-users first.");
  }

  return fixture as FixtureGroups;
}

async function callSupervisionRpc(url: string, publishableKey: string, accessToken: string, counselorGroupId: string, coachGroupId: string) {
  const response = await fetch(`${url}/rest/v1/rpc/${SUPERVISION_RPC}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ target_counselor_group_id: counselorGroupId, target_coach_group_id: coachGroupId }),
  });
  const payload = await response.text();
  return { response, payload };
}

async function assignSupervision(url: string, publishableKey: string, accessToken: string, counselorGroupId: string, coachGroupId: string) {
  const { response, payload } = await callSupervisionRpc(url, publishableKey, accessToken, counselorGroupId, coachGroupId);
  if (!response.ok) throw new Error(`Supervision RPC failed (${response.status}): ${payload}`);
  if (!payload) throw new Error("Supervision RPC returned no assignment id");
  return JSON.parse(payload) as string;
}

async function readActiveAssignment(client: AuthenticatedClient, counselorGroupId: string) {
  const { data, error } = await client.from("supervision_assignments").select("id, coach_group_id, ended_at").eq("counselor_group_id", counselorGroupId).is("ended_at", null);
  failIfError(error, "Unable to read active supervision assignment");
  if ((data ?? []).length > 1) throw new Error("More than one active Coach supervision exists for the DEV Counselor team");
  return data?.[0] ?? null;
}

async function requireRejectedRpc(url: string, publishableKey: string, accessToken: string, counselorGroupId: string, coachGroupId: string, expectation: string) {
  const { response } = await callSupervisionRpc(url, publishableKey, accessToken, counselorGroupId, coachGroupId);
  if (response.ok) throw new Error(`${expectation} was unexpectedly accepted`);
}

async function verify() {
  const configuration = getConfiguration();
  const admin = await signIn(configuration.url, configuration.publishableKey, configuration.adminEmail, configuration.adminPassword);
  const coach = await signIn(configuration.url, configuration.publishableKey, configuration.coachEmail, configuration.coachPassword);
  const fixture = await getFixtureGroups(admin.client);

  const firstAssignmentId = await assignSupervision(configuration.url, configuration.publishableKey, admin.accessToken, fixture.counselor, fixture.coach);
  const firstActive = await readActiveAssignment(admin.client, fixture.counselor);
  if (!firstActive || firstActive.id !== firstAssignmentId || firstActive.coach_group_id !== fixture.coach) {
    throw new Error("First Coach supervision assignment did not produce the expected active relationship");
  }

  const repeatedAssignmentId = await assignSupervision(configuration.url, configuration.publishableKey, admin.accessToken, fixture.counselor, fixture.coach);
  if (repeatedAssignmentId !== firstAssignmentId) throw new Error("Repeated Coach supervision assignment was not idempotent");

  const reassignedId = await assignSupervision(configuration.url, configuration.publishableKey, admin.accessToken, fixture.counselor, fixture.coach2);
  const { data: reassignedRows, error: reassignedRowsError } = await admin.client.from("supervision_assignments").select("id, coach_group_id, ended_at").eq("counselor_group_id", fixture.counselor).in("id", [firstAssignmentId, reassignedId]);
  failIfError(reassignedRowsError, "Unable to verify Coach supervision reassignment history");
  const firstAssignment = reassignedRows?.find((assignment) => assignment.id === firstAssignmentId);
  const reassigned = reassignedRows?.find((assignment) => assignment.id === reassignedId);
  if (!firstAssignment?.ended_at || !reassigned || reassigned.ended_at || reassigned.coach_group_id !== fixture.coach2) {
    throw new Error("Coach supervision reassignment did not preserve the required history");
  }

  const { data: userData, error: userError } = await admin.client.auth.getUser();
  failIfError(userError, "Unable to read the DEV Admin identity");
  if (!userData.user) throw new Error("DEV Admin identity is missing");
  const { error: duplicateError } = await admin.client.from("supervision_assignments").insert({
    coach_group_id: fixture.coach,
    counselor_group_id: fixture.counselor,
    assigned_by: userData.user.id,
  });
  if (!duplicateError || duplicateError.code !== "23505") {
    throw new Error("The active Counselor supervision invariant did not reject a direct duplicate row");
  }

  await requireRejectedRpc(configuration.url, configuration.publishableKey, admin.accessToken, fixture.coach, fixture.coach2, "A non-Counselor target");
  await requireRejectedRpc(configuration.url, configuration.publishableKey, admin.accessToken, fixture.counselor, fixture.couple, "A non-Coach target");
  await requireRejectedRpc(configuration.url, configuration.publishableKey, coach.accessToken, fixture.counselor, fixture.coach, "An unauthorized Coach caller");

  const restoredId = await assignSupervision(configuration.url, configuration.publishableKey, admin.accessToken, fixture.counselor, fixture.coach);
  const restored = await readActiveAssignment(admin.client, fixture.counselor);
  if (!restored || restored.id !== restoredId || restored.coach_group_id !== fixture.coach) {
    throw new Error("Unable to restore the DEV fixture to its expected Coach supervision");
  }

  const { data: auditEvent, error: auditError } = await admin.client.from("audit_events").select("actor_id, details, event_type").eq("entity_id", restoredId).eq("event_type", "supervision.assigned").maybeSingle();
  failIfError(auditError, "Unable to verify the Coach supervision audit event");
  if (!auditEvent || auditEvent.actor_id === null || !auditEvent.details || typeof auditEvent.details !== "object") {
    throw new Error("Coach supervision assignment did not create the required audit event");
  }

  console.log("DEV Counselor supervision assignment contract verified.");
}

await verify();
