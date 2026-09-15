import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const users = [
  ["TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"], ["TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD"],
  ["TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD"], ["TEST_COACH_EMAIL", "TEST_COACH_PASSWORD"],
  ["TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD"], ["TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD"], ["TEST_AUTHOR_EMAIL", "TEST_AUTHOR_PASSWORD"],
] as const;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function client(url: string, key: string) { return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function signedIn(url: string, key: string, credentials: readonly [string, string]) { const value = client(url, key); const { data, error } = await value.auth.signInWithPassword({ email: required(credentials[0]).toLowerCase(), password: required(credentials[1]) }); fail(error, `Sign in ${credentials[0]}`); if (!data.session) throw new Error(`No session for ${credentials[0]}`); return { value, token: data.session.access_token }; }
async function rpc(url: string, key: string, token: string | null, name: string, body: object) { return fetch(`${url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: key, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); }

async function verify() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Operational unassign verification refused outside approved DEV");
  const sessions = await Promise.all(users.map((credentials) => signedIn(url, publishableKey, credentials)));
  const [admin, superAdmin, campusLead, coach, counselor, couple, author] = sessions;
  const { data: groups, error: groupError } = await admin.value.from("groups").select("id,name").in("name", ["DEV Test Campus Lead Team", "DEV Test Coach Team", "DEV Test Counselor Team"]);
  fail(groupError, "Read fixture groups");
  const byName = new Map((groups ?? []).map((group) => [group.name, group.id]));
  const lead = byName.get("DEV Test Campus Lead Team"), coachTeam = byName.get("DEV Test Coach Team"), counselorTeam = byName.get("DEV Test Counselor Team");
  if (!lead || !coachTeam || !counselorTeam) throw new Error("Operational fixture groups are incomplete");
  const snapshot = async () => {
    const { data: members, error: membersError } = await admin.value.from("group_members").select("group_id,profile_id").in("group_id", [lead, coachTeam, counselorTeam]).is("ended_at", null);
    fail(membersError, "Read operational team members");
    const profileIds = (members ?? []).map((member) => member.profile_id);
    const { data: roles, error: rolesError } = await admin.value.from("profile_roles").select("profile_id,role").in("profile_id", profileIds);
    fail(rolesError, "Read operational member roles");
    const { data: coupleAssignments, error: assignmentsError } = await admin.value.from("case_assignments").select("id,assigned_group_id,assignment_type,ended_at").in("assigned_group_id", [coachTeam, counselorTeam]).is("ended_at", null);
    fail(assignmentsError, "Read active Couple assignments");
    return JSON.stringify({
      members: (members ?? []).sort((left, right) => `${left.group_id}:${left.profile_id}`.localeCompare(`${right.group_id}:${right.profile_id}`)),
      roles: (roles ?? []).sort((left, right) => `${left.profile_id}:${left.role}`.localeCompare(`${right.profile_id}:${right.role}`)),
      coupleAssignments: (coupleAssignments ?? []).sort((left, right) => left.id.localeCompare(right.id)),
    });
  };
  const beforeSnapshot = await snapshot();
  fail((await admin.value.rpc("assign_campus_lead_coach", { target_campus_lead_group_id: lead, target_coach_group_id: coachTeam })).error, "Prepare Campus Lead Coach relationship");
  fail((await admin.value.rpc("assign_counselor_coach_supervision", { target_counselor_group_id: counselorTeam, target_coach_group_id: coachTeam })).error, "Prepare Coach Counselor relationship");
  const leadBody = { target_campus_lead_group_id: lead, target_coach_group_id: coachTeam };
  const supervisionBody = { target_counselor_group_id: counselorTeam };
  for (const session of [campusLead, coach, counselor, couple, author]) if ((await rpc(url, publishableKey, session.token, "unassign_campus_lead_coach", leadBody)).ok) throw new Error("Unauthorized caller ended Campus Lead Coach relationship");
  if ((await rpc(url, publishableKey, null, "unassign_campus_lead_coach", leadBody)).ok) throw new Error("Unauthenticated caller ended Campus Lead Coach relationship");
  if (!(await rpc(url, publishableKey, admin.token, "unassign_campus_lead_coach", leadBody)).ok) throw new Error("Admin could not unassign Campus Lead Coach relationship");
  const leadRows = await admin.value.from("campus_lead_coach_assignments").select("id,ended_at").eq("campus_lead_group_id", lead).eq("coach_group_id", coachTeam).order("started_at", { ascending: false }).limit(1); fail(leadRows.error, "Read Campus Lead Coach history"); if (!leadRows.data?.[0]?.ended_at) throw new Error("Campus Lead Coach row was not preserved as ended history");
  if (!(await rpc(url, publishableKey, admin.token, "unassign_campus_lead_coach", leadBody)).ok) throw new Error("Campus Lead Coach unassign was not idempotent");
  fail((await admin.value.rpc("assign_campus_lead_coach", { target_campus_lead_group_id: lead, target_coach_group_id: coachTeam })).error, "Restore Campus Lead Coach relationship");
  if (!(await rpc(url, publishableKey, superAdmin.token, "unassign_campus_lead_coach", leadBody)).ok) throw new Error("Super Admin could not unassign Campus Lead Coach relationship");
  const { data: leadAudit, error: leadAuditError } = await admin.value.from("audit_events").select("id").eq("event_type", "campus_lead_coach.unassigned").limit(1); fail(leadAuditError, "Read Campus Lead Coach audit"); if (!leadAudit?.length) throw new Error("Campus Lead Coach unassign audit missing");
  fail((await admin.value.rpc("assign_campus_lead_coach", { target_campus_lead_group_id: lead, target_coach_group_id: coachTeam })).error, "Restore Campus Lead Coach relationship after Super Admin check");
  for (const session of [campusLead, coach, counselor, couple, author]) if ((await rpc(url, publishableKey, session.token, "unassign_counselor_coach_supervision", supervisionBody)).ok) throw new Error("Unauthorized caller ended Coach Counselor supervision");
  if ((await rpc(url, publishableKey, null, "unassign_counselor_coach_supervision", supervisionBody)).ok) throw new Error("Unauthenticated caller ended Coach Counselor supervision");
  if (!(await rpc(url, publishableKey, admin.token, "unassign_counselor_coach_supervision", supervisionBody)).ok) throw new Error("Admin could not unassign Coach Counselor supervision");
  const supervisionRows = await admin.value.from("supervision_assignments").select("id,ended_at").eq("counselor_group_id", counselorTeam).order("started_at", { ascending: false }).limit(1); fail(supervisionRows.error, "Read supervision history"); if (!supervisionRows.data?.[0]?.ended_at) throw new Error("Supervision row was not preserved as ended history");
  if (!(await rpc(url, publishableKey, admin.token, "unassign_counselor_coach_supervision", supervisionBody)).ok) throw new Error("Supervision unassign was not idempotent");
  fail((await admin.value.rpc("assign_counselor_coach_supervision", { target_counselor_group_id: counselorTeam, target_coach_group_id: coachTeam })).error, "Restore supervision");
  if (!(await rpc(url, publishableKey, superAdmin.token, "unassign_counselor_coach_supervision", supervisionBody)).ok) throw new Error("Super Admin could not unassign Coach Counselor supervision");
  const { data: supervisionAudit, error: supervisionAuditError } = await admin.value.from("audit_events").select("id").eq("event_type", "supervision.unassigned").limit(1); fail(supervisionAuditError, "Read supervision audit"); if (!supervisionAudit?.length) throw new Error("Supervision unassign audit missing");
  fail((await admin.value.rpc("assign_counselor_coach_supervision", { target_counselor_group_id: counselorTeam, target_coach_group_id: coachTeam })).error, "Restore supervision after Super Admin check");
  if (beforeSnapshot !== await snapshot()) throw new Error("Operational Unassign changed a team, role, or Couple Counselor-of-record assignment");
  console.log("DEV operational Unassign contract verified.");
}

await verify();
