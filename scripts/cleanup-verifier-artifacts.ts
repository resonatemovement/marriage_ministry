import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const PREFIXES = ["verify-campus-lead-", "verify-campus-lead-coach-campus-", "verify-cross-campus-counseling-"] as const;
type Family = typeof PREFIXES[number];
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function owned(value: string | null, prefix: Family) {
  if (!value) return false;
  if (prefix === "verify-campus-lead-") return /^verify-campus-lead-\d+(?:\s|-|@)/.test(value);
  return value.startsWith(prefix);
}

async function main() {
  const { url } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Verifier artifact cleanup refused outside approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const relationshipCleanup = await (service as unknown as { rpc(name: "cleanup_verifier_relationship_artifacts"): Promise<{ data: Record<string, number> | null; error: { message: string } | null }> }).rpc("cleanup_verifier_relationship_artifacts");
  fail(relationshipCleanup.error, "Clean verifier-owned protected relationships");
  console.log("Protected relationship cleanup:", relationshipCleanup.data ?? {});
  for (const prefix of PREFIXES) {
    const [campusResult, groupResult, profileResult, invitationResult] = await Promise.all([
      service.from("campuses").select("id,name").like("name", `${prefix}%`),
      service.from("groups").select("id,name,campus_id").like("name", `${prefix}%`),
      service.from("profiles").select("id,email").like("email", `${prefix}%@example.test`),
      service.from("invitations").select("id,email,group_id").like("email", `${prefix}%@example.test`),
    ]);
    fail(campusResult.error, `Read ${prefix} campuses`); fail(groupResult.error, `Read ${prefix} groups`); fail(profileResult.error, `Read ${prefix} profiles`); fail(invitationResult.error, `Read ${prefix} invitations`);
    const campusIds = (campusResult.data ?? []).filter((row) => owned(row.name, prefix)).map((row) => row.id);
    const profileIds = (profileResult.data ?? []).filter((row) => owned(row.email, prefix)).map((row) => row.id);
    const invitationsByProfileResult = profileIds.length ? await service.from("invitations").select("id,email,group_id").in("invited_by", profileIds) : { data: [], error: null };
    fail(invitationsByProfileResult.error, `Read ${prefix} profile invitations`);
    const invitations = [...new Map([...(invitationResult.data ?? []).filter((row) => owned(row.email, prefix)), ...(invitationsByProfileResult.data ?? [])].map((row) => [row.id, row])).values()];
    const invitationGroupIds = invitations.flatMap((row) => row.group_id ? [row.group_id] : []);
    const linkedGroupsResult = invitationGroupIds.length ? await service.from("groups").select("id,name,campus_id").in("id", invitationGroupIds) : { data: [], error: null };
    fail(linkedGroupsResult.error, `Read ${prefix} invitation groups`);
    const groupsById = new Map([...(groupResult.data ?? []), ...(linkedGroupsResult.data ?? [])].map((row) => [row.id, row]));
    const groupIds = [...groupsById.values()]
      // A previous failed legacy cleanup can remove the disposable campus before
      // the invitation-created group. The exact numeric-run invitation remains
      // sufficient ownership proof for that otherwise-derived group name.
      .filter((row) => owned(row.name, prefix) || invitationGroupIds.includes(row.id))
      .map((row) => row.id);
    if (invitationGroupIds.some((groupId) => !groupIds.includes(groupId))) throw new Error(`${prefix} invitation group ownership is ambiguous`);
    console.log(`${prefix} targets: campuses=${campusIds.length}, groups=${groupIds.length}, profiles=${profileIds.length}, invitations=${invitations.length}`);
    const caseResult = groupIds.length ? await service.from("counseling_cases").select("id").in("couple_group_id", groupIds) : { data: [], error: null };
    fail(caseResult.error, `Read ${prefix} cases`); const caseIds = (caseResult.data ?? []).map((row) => row.id);
    if (caseIds.length) throw new Error(`${prefix} retained verifier case after privileged cleanup`);
    const intakeResult = campusIds.length ? await service.from("intake_requests" as never).select("id").in("campus_id", campusIds) : { data: [], error: null };
    fail(intakeResult.error, `Read ${prefix} intakes`);
    const intakeIds = ((intakeResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (intakeIds.length) {
      fail((await service.from("intake_requests" as never).update({ status: "ready_for_review", invited_group_id: null } as never).in("id", intakeIds)).error, `Reset ${prefix} intakes`);
    }
    if (invitations.length) {
      const invitationIds = invitations.map((row) => row.id);
      fail((await service.from("audit_events").delete().in("entity_id", invitationIds)).error, `Delete ${prefix} invitation audit events`);
      fail((await service.from("invitations").delete().in("id", invitationIds)).error, `Delete ${prefix} invitations`);
    }
    if (intakeIds.length) {
      fail((await service.from("audit_events").delete().in("entity_id", intakeIds)).error, `Delete ${prefix} intake audit events`);
      fail((await service.from("intake_request_status_history" as never).delete().in("intake_request_id", intakeIds)).error, `Delete ${prefix} intake history`);
      fail((await service.from("notification_deliveries" as never).delete().eq("related_entity_type", "intake_request").in("related_entity_id", intakeIds)).error, `Delete ${prefix} intake notifications`);
      // The participant-cardinality constraint deliberately rejects standalone
      // person deletion. Removing the parent cascades its two owned people.
      fail((await service.from("intake_requests" as never).delete().in("id", intakeIds)).error, `Delete ${prefix} intakes`);
    }
    if (groupIds.length) { fail((await service.from("group_members").delete().in("group_id", groupIds)).error, `Delete ${prefix} memberships`); fail((await service.from("groups").delete().in("id", groupIds)).error, `Delete ${prefix} groups`); }
    if (profileIds.length) { const paths = profileIds.flatMap((profileId) => [`profiles/${profileId}/avatar.avif`, `profiles/${profileId}/avatar.webp`]); const storage = await service.storage.from("profile-photos").remove(paths); fail(storage.error, `Delete ${prefix} profile photos`); fail((await service.from("campus_lead_assignments" as never).delete().in("profile_id", profileIds)).error, `Delete ${prefix} campus scopes`); fail((await service.from("profile_roles").delete().in("profile_id", profileIds)).error, `Delete ${prefix} roles`); fail((await service.from("profiles").delete().in("id", profileIds)).error, `Delete ${prefix} profiles`); for (const profileId of profileIds) fail((await service.auth.admin.deleteUser(profileId)).error, `Delete ${prefix} Auth user`); }
    if (campusIds.length) fail((await service.from("campuses").delete().in("id", campusIds)).error, `Delete ${prefix} campuses`);
    const [remainingGroups, remainingProfiles, remainingCampuses] = await Promise.all([service.from("groups").select("id,name").like("name", `${prefix}%`), service.from("profiles").select("id,email").like("email", `${prefix}%@example.test`), service.from("campuses").select("id,name").like("name", `${prefix}%`)]);
    fail(remainingGroups.error, `Verify ${prefix} groups`); fail(remainingProfiles.error, `Verify ${prefix} profiles`); fail(remainingCampuses.error, `Verify ${prefix} campuses`);
    if ((remainingGroups.data ?? []).some((row) => owned(row.name, prefix)) || (remainingProfiles.data ?? []).some((row) => owned(row.email, prefix)) || (remainingCampuses.data ?? []).some((row) => owned(row.name, prefix))) throw new Error(`${prefix} cleanup did not reach zero artifacts`);
  }
  console.log("Verifier artifact cleanup completed with zero approved-prefix artifacts.");
}
await main();
