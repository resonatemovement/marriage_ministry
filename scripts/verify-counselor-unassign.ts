import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";

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

async function signIn(url: string, key: string, emailName: string, passwordName: string) {
  const signedIn = client(url, key);
  const { data, error } = await signedIn.auth.signInWithPassword({ email: required(emailName).toLowerCase(), password: required(passwordName) });
  fail(error, `Unable to sign in ${emailName}`);
  if (!data.session) throw new Error(`No session for ${emailName}`);
  return { signedIn, token: data.session.access_token };
}

async function rpc(url: string, key: string, token: string | null, coupleGroupId: string) {
  return fetch(`${url}/rest/v1/rpc/unassign_counseling_case`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ target_couple_group_id: coupleGroupId }),
  });
}

async function verify() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("DEV counselor unassign verification refused: configured project is not approved DEV.");
  const admin = await signIn(url, publishableKey, "TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD");
  const superAdmin = await signIn(url, publishableKey, "TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD");
  const denied = await Promise.all([
    signIn(url, publishableKey, "TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD"),
    signIn(url, publishableKey, "TEST_COACH_EMAIL", "TEST_COACH_PASSWORD"),
    signIn(url, publishableKey, "TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD"),
    signIn(url, publishableKey, "TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD"),
  ]);
  const { data: couples, error: fixtureError } = await admin.signedIn.from("groups").select("id,campus_id,group_members(ended_at,profile:profiles(status,onboarding_completed_at)),invitations(status)").eq("group_type", "couple").eq("active", true);
  fail(fixtureError, "Unable to load DEV Couple fixtures");
  const fixture = (couples ?? []).find((couple) => {
    const members = couple.group_members ?? [];
    return members.length === 2 && members.every((member) => {
      const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
      return member.ended_at === null && profile?.status === "active" && profile.onboarding_completed_at;
    }) && !(couple.invitations ?? []).some((invitation) => invitation.status === "pending");
  });
  const { data: counselorTeams, error: counselorError } = await admin.signedIn.from("groups").select("id,campus_id").eq("group_type", "counselor_team").eq("active", true);
  fail(counselorError, "Unable to load DEV Counselor fixtures");
  const counselor = (counselorTeams ?? []).find((team) => team.campus_id === fixture?.campus_id);
  if (!fixture || !counselor) throw new Error("DEV counselor unassign fixtures are incomplete. Run npm run setup:test-users first.");
  const { error: assignmentError } = await admin.signedIn.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: fixture.id, target_group_id: counselor.id, target_profile_id: null, target_assignment_type: "counselor" });
  fail(assignmentError, "Unable to prepare active Counselor-of-record assignment");
  const { data: before, error: beforeError } = await admin.signedIn.from("counseling_cases").select("id,status,case_assignments(id,assigned_group_id,assignment_type,ended_at,end_reason)").eq("couple_group_id", fixture.id).single();
  fail(beforeError, "Unable to read prepared case");
  if (!before) throw new Error("Prepared counseling case is missing");
  const active = (before.case_assignments as Array<{ id: string; assigned_group_id: string; assignment_type: string; ended_at: string | null; end_reason: string | null }>).find((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null);
  if (!active) throw new Error("Fixture has no active Counselor-of-record assignment");
  for (const [label, user] of [["Campus Lead", denied[0]], ["Coach", denied[1]], ["Counselor", denied[2]], ["Couple", denied[3]]] as const) {
    if ((await rpc(url, publishableKey, user.token, fixture.id)).ok) throw new Error(`${label} unexpectedly unassigned Counselor-of-record`);
  }
  if ((await rpc(url, publishableKey, null, fixture.id)).ok) throw new Error("Unauthenticated caller unexpectedly unassigned Counselor-of-record");
  if (!(await rpc(url, publishableKey, superAdmin.token, fixture.id)).ok) throw new Error("Super Admin could not unassign Counselor-of-record");
  const { data: afterSuper, error: afterSuperError } = await admin.signedIn.from("counseling_cases").select("status,case_assignments(id,assigned_group_id,assignment_type,ended_at,end_reason)").eq("id", before.id).single();
  fail(afterSuperError, "Unable to read Super Admin unassign result");
  if (!afterSuper) throw new Error("Counseling case disappeared after unassign");
  const ended = (afterSuper.case_assignments as Array<{ id: string; assigned_group_id: string; assignment_type: string; ended_at: string | null; end_reason: string | null }>).find((assignment) => assignment.id === active.id);
  if (!ended?.ended_at || !ended.end_reason || ended.assigned_group_id !== active.assigned_group_id || afterSuper.status !== before.status) throw new Error("Unassign did not preserve assignment history or case status");
  if ((afterSuper.case_assignments as Array<{ assignment_type: string; ended_at: string | null }>).some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null)) throw new Error("Unassigned Couple remained in the active Counselor-of-record list");
  if ((await rpc(url, publishableKey, superAdmin.token, fixture.id)).status >= 400) throw new Error("Repeated Super Admin unassign was not idempotent");
  const { error: reassignmentError } = await admin.signedIn.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: fixture.id, target_group_id: counselor.id, target_profile_id: null, target_assignment_type: "counselor" });
  fail(reassignmentError, "Unable to restore active assignment for Admin verification");
  if (!(await rpc(url, publishableKey, admin.token, fixture.id)).ok) throw new Error("Admin could not unassign Counselor-of-record");
  const { data: audit, error: auditError } = await admin.signedIn.from("audit_events").select("actor_id,details").eq("entity_id", before.id).eq("event_type", "case.unassigned").limit(1);
  fail(auditError, "Unable to read unassign audit event");
  if (!audit?.length || !audit[0].actor_id || !audit[0].details) throw new Error("Unassign audit event was not recorded");
  const { error: finalReassignmentError } = await admin.signedIn.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: fixture.id, target_group_id: counselor.id, target_profile_id: null, target_assignment_type: "counselor" });
  fail(finalReassignmentError, "Unable to verify normal reassignment after unassign");
  console.log("DEV Counselor-of-record Unassign contract verified.");
}

await verify();
