import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const RUN = /^verify-campus-lead-\d+(?:\s|[-@])/;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function ids(rows: Array<{ id: string }> | null) { return (rows ?? []).map((row) => row.id); }

async function main() {
  const { url } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Verifier cleanup refused outside approved DEV");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const [campusesResult, groupsResult, profilesResult, invitationsResult] = await Promise.all([
    service.from("campuses").select("id,name").like("name", "verify-campus-lead-%"),
    service.from("groups").select("id,name,campus_id").like("name", "verify-campus-lead-%"),
    service.from("profiles").select("id,email").like("email", "verify-campus-lead-%@example.test"),
    service.from("invitations").select("id,email,group_id").like("email", "verify-campus-lead-%@example.test"),
  ]);
  fail(campusesResult.error, "Read verifier campuses"); fail(groupsResult.error, "Read verifier groups"); fail(profilesResult.error, "Read verifier profiles"); fail(invitationsResult.error, "Read verifier invitations");
  const campuses = (campusesResult.data ?? []).filter((row) => RUN.test(row.name));
  const campusIds = new Set(ids(campuses));
  const profiles = (profilesResult.data ?? []).filter((row) => RUN.test(row.email));
  const invitations = (invitationsResult.data ?? []).filter((row) => RUN.test(row.email));
  const invitationGroupIds = invitations.flatMap((row) => row.group_id ? [row.group_id] : []);
  const linkedGroupsResult = invitationGroupIds.length ? await service.from("groups").select("id,name,campus_id").in("id", invitationGroupIds) : { data: [], error: null };
  fail(linkedGroupsResult.error, "Read verifier invitation groups");
  const groups = [...new Map([...(groupsResult.data ?? []), ...(linkedGroupsResult.data ?? [])].map((row) => [row.id, row])).values()].filter((row) => campusIds.has(row.campus_id) && (RUN.test(row.name) || invitationGroupIds.includes(row.id)));
  const groupIds = new Set(ids(groups));
  if (invitationGroupIds.some((groupId) => !groupIds.has(groupId))) throw new Error("Ambiguous verifier invitation group; refusing cleanup");
  console.log(`Verified Campus Lead artifacts: campuses=${campuses.length}, groups=${groups.length}, profiles=${profiles.length}, invitations=${invitations.length}`);
  const campusIdList = [...campusIds], groupIdList = [...groupIds], profileIds = ids(profiles), invitationIds = ids(invitations);
  const { data: assignmentRows, error: assignmentError } = groupIdList.length ? await service.from("case_assignments").select("id,counseling_case_id").in("assigned_group_id", groupIdList) : { data: [], error: null };
  fail(assignmentError, "Read verifier group assignments");
  if ((assignmentRows ?? []).length) throw new Error(`Verifier group has ${(assignmentRows ?? []).length} case-assignment reference(s); refusing cleanup to protect potentially shared counseling history`);
  const { data: intakeRows, error: intakeError } = campusIdList.length ? await service.from("intake_requests" as never).select("id").in("campus_id", campusIdList) : { data: [], error: null };
  fail(intakeError, "Read verifier intakes"); const intakeIds = ids(intakeRows as Array<{ id: string }> | null);
  if (groupIdList.length) { fail((await service.from("group_members").delete().in("group_id", groupIdList)).error, "Delete verifier memberships"); fail((await service.from("groups").delete().in("id", groupIdList)).error, "Delete verifier groups"); }
  if (invitationIds.length) { fail((await service.from("audit_events").delete().in("entity_id", invitationIds)).error, "Delete verifier invitation audit events"); fail((await service.from("invitations").delete().in("id", invitationIds)).error, "Delete verifier invitations"); }
  if (intakeIds.length) { fail((await service.from("audit_events").delete().in("entity_id", intakeIds)).error, "Delete verifier intake audit events"); fail((await service.from("intake_request_status_history" as never).delete().in("intake_request_id", intakeIds)).error, "Delete verifier intake history"); fail((await service.from("intake_request_people" as never).delete().in("intake_request_id", intakeIds)).error, "Delete verifier intake people"); fail((await service.from("intake_requests" as never).delete().in("id", intakeIds)).error, "Delete verifier intakes"); }
  if (profileIds.length) { fail((await service.from("campus_lead_assignments" as never).delete().in("profile_id", profileIds)).error, "Delete verifier campus scopes"); fail((await service.from("profile_roles").delete().in("profile_id", profileIds)).error, "Delete verifier roles"); fail((await service.from("profiles").delete().in("id", profileIds)).error, "Delete verifier profiles"); for (const profileId of profileIds) { const result = await service.auth.admin.deleteUser(profileId); fail(result.error, "Delete verifier Auth user"); } }
  if (campusIdList.length) fail((await service.from("campuses").delete().in("id", campusIdList)).error, "Delete verifier campuses");
  console.log(`Removed verified Campus Lead artifacts: campuses=${campusIdList.length}, groups=${groupIdList.length}, profiles=${profileIds.length}, invitations=${invitationIds.length}, intakes=${intakeIds.length}`);
}

await main();
