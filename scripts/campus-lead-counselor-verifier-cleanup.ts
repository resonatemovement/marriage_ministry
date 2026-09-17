import type { SupabaseClient } from "@supabase/supabase-js";

export const campusLeadCounselorVerifierPrefix = "verify-campus-lead-counselor-";

type CleanupResult = { data: Record<string, number> | null; error: { message: string } | null };
function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

export async function cleanupCampusLeadCounselorVerifierArtifacts(service: SupabaseClient) {
  const prefix = campusLeadCounselorVerifierPrefix;
  const [campuses, groups, profiles, invitations, users] = await Promise.all([
    service.from("campuses").select("id").like("name", `${prefix}%`),
    service.from("groups").select("id").like("name", `${prefix}%`),
    service.from("profiles").select("id").like("email", `${prefix}%@example.test`),
    service.from("invitations").select("id").like("email", `${prefix}%@example.test`),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  fail(campuses.error, "Read stale verifier campuses"); fail(groups.error, "Read stale verifier groups"); fail(profiles.error, "Read stale verifier profiles"); fail(invitations.error, "Read stale verifier invitations"); fail(users.error, "Read stale verifier Auth users");
  const campusIds = (campuses.data ?? []).map((row) => row.id);
  const groupIds = (groups.data ?? []).map((row) => row.id);
  const profileIds = (profiles.data ?? []).map((row) => row.id);
  const invitationIds = (invitations.data ?? []).map((row) => row.id);
  const authUserIds = (users.data.users ?? []).filter((user) => user.email?.startsWith(prefix)).map((user) => user.id);
  const auditResults = await Promise.all(groupIds.flatMap((groupId) => [
    service.from("audit_events").select("id").contains("details", { campus_lead_group_id: groupId }),
    service.from("audit_events").select("id").contains("details", { counselor_group_id: groupId }),
    service.from("audit_events").select("id").contains("details", { coach_group_id: groupId }),
  ]));
  for (const result of auditResults) fail(result.error, "Read verifier relationship audit events");
  const auditIds = [...new Set(auditResults.flatMap((result) => (result.data ?? []).map((row) => row.id)))];
  if (auditIds.length) fail((await service.from("audit_events").delete().in("id", auditIds)).error, "Remove verifier relationship audit events");
  const relationshipCleanup = await (service as unknown as { rpc(name: "cleanup_verifier_relationship_artifacts"): Promise<CleanupResult> }).rpc("cleanup_verifier_relationship_artifacts");
  fail(relationshipCleanup.error, "Clean verifier-owned relationship history");
  if (invitationIds.length) {
    fail((await service.from("audit_events").delete().in("entity_id", invitationIds)).error, "Remove verifier invitation audit events");
    fail((await service.from("invitations").delete().in("id", invitationIds)).error, "Remove verifier invitations");
  }
  if (groupIds.length) {
    fail((await service.from("group_members").delete().in("group_id", groupIds)).error, "Remove verifier memberships");
    fail((await service.from("groups").delete().in("id", groupIds)).error, "Remove verifier groups");
  }
  if (profileIds.length) {
    fail((await service.from("campus_lead_assignments" as never).delete().in("profile_id", profileIds)).error, "Remove verifier Campus Lead scopes");
    fail((await service.from("profile_roles").delete().in("profile_id", profileIds)).error, "Remove verifier roles");
    fail((await service.from("profiles").delete().in("id", profileIds)).error, "Remove verifier profiles");
  }
  for (const authUserId of authUserIds) fail((await service.auth.admin.deleteUser(authUserId)).error, "Remove verifier Auth identity");
  if (campusIds.length) fail((await service.from("campuses").delete().in("id", campusIds)).error, "Remove verifier campuses");
  const [remainingCampuses, remainingGroups, remainingProfiles, remainingInvitations, remainingUsers] = await Promise.all([
    service.from("campuses").select("id").like("name", `${prefix}%`),
    service.from("groups").select("id").like("name", `${prefix}%`),
    service.from("profiles").select("id").like("email", `${prefix}%@example.test`),
    service.from("invitations").select("id").like("email", `${prefix}%@example.test`),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  fail(remainingCampuses.error, "Verify verifier campuses"); fail(remainingGroups.error, "Verify verifier groups"); fail(remainingProfiles.error, "Verify verifier profiles"); fail(remainingInvitations.error, "Verify verifier invitations"); fail(remainingUsers.error, "Verify verifier Auth users");
  const remaining = { campuses: remainingCampuses.data?.length ?? 0, groups: remainingGroups.data?.length ?? 0, profiles: remainingProfiles.data?.length ?? 0, invitations: remainingInvitations.data?.length ?? 0, authUsers: (remainingUsers.data.users ?? []).filter((user) => user.email?.startsWith(prefix)).length };
  if (Object.values(remaining).some(Boolean)) throw new Error(`Campus Lead Counselor verifier cleanup did not reach zero artifacts: ${JSON.stringify(remaining)}`);
  return { ...relationshipCleanup.data, auditEvents: auditIds.length, campuses: campusIds.length, groups: groupIds.length, profiles: profileIds.length, invitations: invitationIds.length, authUsers: authUserIds.length };
}
