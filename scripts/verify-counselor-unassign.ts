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

type Assignment = { id: string; assigned_group_id: string; assignment_type: string; ended_at: string | null; end_reason: string | null };
type Provider = { id: string; group_type: "counselor_team" | "coach_team" | "campus_lead_team" };

function activeCounselorAssignment(assignments: Assignment[]) {
  return assignments.find((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null);
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
  const { data: teams, error: teamError } = await admin.signedIn.from("groups").select("id,campus_id,group_type").in("group_type", ["counselor_team", "coach_team", "campus_lead_team"] as never).eq("active", true);
  fail(teamError, "Unable to load DEV Counselor-of-record provider fixtures");
  if (!fixture) throw new Error("DEV Couple fixtures are incomplete. Run npm run setup:test-users first.");
  const providers = (["campus_lead_team", "coach_team", "counselor_team"] as const).map((groupType) => (teams ?? []).find((team) => team.campus_id === fixture.campus_id && team.group_type === groupType) as Provider | undefined);
  if (providers.some((provider) => !provider)) throw new Error("DEV Counselor-of-record provider fixtures are incomplete. Run npm run setup:test-users first.");
  const [campusLead, coach, counselor] = providers as Provider[];
  const { error: assignmentError } = await admin.signedIn.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: fixture.id, target_group_id: campusLead.id, target_profile_id: null, target_assignment_type: "counselor" });
  fail(assignmentError, "Unable to prepare active Campus Lead Counselor-of-record assignment");
  const { data: before, error: beforeError } = await admin.signedIn.from("counseling_cases").select("id,status,case_assignments(id,assigned_group_id,assignment_type,ended_at,end_reason)").eq("couple_group_id", fixture.id).single();
  fail(beforeError, "Unable to read prepared case");
  if (!before || before.status !== "matched") throw new Error("Prepared counseling case is not matched");
  const active = activeCounselorAssignment(before.case_assignments as Assignment[]);
  if (!active || active.assigned_group_id !== campusLead.id) throw new Error("Fixture has no active Campus Lead Counselor-of-record assignment");
  for (const [label, user] of [["Campus Lead", denied[0]], ["Coach", denied[1]], ["Counselor", denied[2]], ["Couple", denied[3]]] as const) {
    if ((await rpc(url, publishableKey, user.token, fixture.id)).ok) throw new Error(`${label} unexpectedly unassigned Counselor-of-record`);
  }
  if ((await rpc(url, publishableKey, null, fixture.id)).ok) throw new Error("Unauthenticated caller unexpectedly unassigned Counselor-of-record");
  if (!(await rpc(url, publishableKey, superAdmin.token, fixture.id)).ok) throw new Error("Super Admin could not unassign Campus Lead Counselor-of-record");
  const { data: afterSuper, error: afterSuperError } = await admin.signedIn.from("counseling_cases").select("status,case_assignments(id,assigned_group_id,assignment_type,ended_at,end_reason)").eq("id", before.id).single();
  fail(afterSuperError, "Unable to read Super Admin unassign result");
  if (!afterSuper) throw new Error("Counseling case disappeared after unassign");
  const ended = (afterSuper.case_assignments as Assignment[]).find((assignment) => assignment.id === active.id);
  if (!ended?.ended_at || !ended.end_reason || ended.assigned_group_id !== active.assigned_group_id || afterSuper.status !== "interviewed" || activeCounselorAssignment(afterSuper.case_assignments as Assignment[])) throw new Error("Campus Lead unassign did not atomically preserve history, transition to interviewed, and clear the active Counselor-of-record");
  const { data: history, error: historyError } = await admin.signedIn.from("case_status_history").select("from_status,to_status").eq("counseling_case_id", before.id).eq("from_status", "matched").eq("to_status", "interviewed").limit(1);
  fail(historyError, "Unable to read counseling case status history");
  if (!history?.length) throw new Error("Matched-to-interviewed status history was not preserved");
  if ((await rpc(url, publishableKey, superAdmin.token, fixture.id)).status >= 400) throw new Error("Repeated Super Admin unassign was not idempotent");
  for (const [provider, label] of [[coach, "Coach"], [counselor, "Counselor"]] as const) {
    const { error: reassignmentError } = await admin.signedIn.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: fixture.id, target_group_id: provider.id, target_profile_id: null, target_assignment_type: "counselor" });
    fail(reassignmentError, `Unable to assign ${label} Counselor-of-record after unassign`);
    const result = await rpc(url, publishableKey, admin.token, fixture.id);
    if (!result.ok) throw new Error(`Admin could not unassign ${label} Counselor-of-record`);
    const { data: afterUnassign, error: afterUnassignError } = await admin.signedIn.from("counseling_cases").select("status,case_assignments(assigned_group_id,assignment_type,ended_at)").eq("id", before.id).single();
    fail(afterUnassignError, `Unable to read ${label} unassign result`);
    const assignments = afterUnassign?.case_assignments as Assignment[] | undefined;
    if (afterUnassign?.status !== "interviewed" || !assignments || activeCounselorAssignment(assignments)) throw new Error(`${label} unassign did not leave an interviewed case with no active Counselor-of-record`);
  }
  const { data: audit, error: auditError } = await admin.signedIn.from("audit_events").select("actor_id,details").eq("entity_id", before.id).eq("event_type", "case.unassigned").limit(1);
  fail(auditError, "Unable to read unassign audit event");
  if (!audit?.length || !audit[0].actor_id || !audit[0].details) throw new Error("Unassign audit event was not recorded");
  const { error: finalReassignmentError } = await admin.signedIn.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: fixture.id, target_group_id: counselor.id, target_profile_id: null, target_assignment_type: "counselor" });
  fail(finalReassignmentError, "Unable to verify normal reassignment after unassign");
  const { data: finalCase, error: finalCaseError } = await admin.signedIn.from("counseling_cases").select("status,case_assignments(assigned_group_id,assignment_type,ended_at)").eq("id", before.id).single();
  fail(finalCaseError, "Unable to read final reassignment");
  if (finalCase?.status !== "matched" || activeCounselorAssignment(finalCase.case_assignments as Assignment[] | undefined ?? [])?.assigned_group_id !== counselor.id) throw new Error("Normal reassignment did not restore matched Counselor-of-record semantics");
  console.log("DEV Campus Lead, Coach, and Counselor Counselor-of-record unassign contract verified with no new verifier artifacts.");
}

await verify();
