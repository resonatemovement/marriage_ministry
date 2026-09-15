import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-intake-permanent-delete-${Date.now()}`;
const verifierPrefix = "verify-intake-permanent-delete-";
type Row = Record<string, unknown>;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function id(row: unknown, label: string) {
  const value = (row as Row | null)?.id;
  if (typeof value !== "string") throw new Error(`${label} id is missing`);
  return value;
}

async function main() {
  const { url } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) {
    throw new Error("Intake permanent-delete verifier refused outside approved DEV.");
  }

  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const campus = await service.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campus.error, "Read active DEV campus");
  const campusId = id(campus.data, "Active DEV campus");
  const password = `Verify-${crypto.randomUUID()}!`;
  const intakeIds: string[] = [];
  const groupIds: string[] = [];
  const invitationIds: string[] = [];
  const authUserIds: string[] = [];
  const photoPaths: string[] = [];

  const removeAuth = async (ids: string[]) => {
    for (const authUserId of [...new Set(ids)]) {
      const removed = await service.auth.admin.deleteUser(authUserId);
      if (removed.error && !/not found/i.test(removed.error.message)) throw new Error(`Remove verifier Auth identity: ${removed.error.message}`);
    }
  };

  const createIntake = async (label: string, groupId: string | null) => {
    const created = await service.from("intake_requests" as never).insert({
      campus_id: campusId, relationship_status: "married", currently_working_with_counselor: false,
      requested_support: ["lay_counselor"], goals: `${prefix} ${label}`, referral_source: "website",
      ...(groupId ? { status: "invited", invited_group_id: groupId } : {}),
    } as never).select("id").single();
    fail(created.error, `Create ${label} Intake Request`);
    const intakeId = id(created.data, `${label} Intake Request`);
    intakeIds.push(intakeId);
    const people = await service.from("intake_request_people" as never).insert([
      { intake_request_id: intakeId, person_position: "requester", first_name: "Verify", last_name: `${label} One`, email: `${prefix}-${label}-one@example.test`, phone: "+15555550101", city: "Test City" },
      { intake_request_id: intakeId, person_position: "partner", first_name: "Verify", last_name: `${label} Two`, email: `${prefix}-${label}-two@example.test`, phone: "+15555550102", city: "Test City" },
    ] as never);
    fail(people.error, `Create ${label} Intake people`);
    return intakeId;
  };

  const createCouple = async (label: string) => {
    const created = await service.from("groups").insert({ campus_id: campusId, group_type: "couple", name: `${prefix} ${label}` }).select("id").single();
    fail(created.error, `Create ${label} Couple`);
    const groupId = id(created.data, `${label} Couple`);
    groupIds.push(groupId);
    return groupId;
  };

  const createMember = async (label: string, groupId: string) => {
    const email = `${prefix}-${label}@example.test`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    fail(created.error, `Create ${label} Auth identity`);
    const profileId = id(created.data.user, `${label} Auth identity`);
    authUserIds.push(profileId);
    fail((await service.from("profiles").upsert({ id: profileId, campus_id: campusId, email, first_name: "Verify", last_name: label, status: "active" }, { onConflict: "id" })).error, `Create ${label} profile`);
    fail((await service.from("profile_roles").insert({ profile_id: profileId, role: "couple", assigned_by: profileId } as never)).error, `Create ${label} role`);
    fail((await service.from("group_members").insert({ group_id: groupId, profile_id: profileId })).error, `Create ${label} membership`);
    for (const extension of ["avif", "webp"] as const) {
      const path = `profiles/${profileId}/avatar.${extension}`;
      const uploaded = await service.storage.from("profile-photos").upload(path, new Blob([extension.toUpperCase()], { type: `image/${extension}` }), { upsert: true, contentType: `image/${extension}` });
      fail(uploaded.error, `Create ${label} ${extension.toUpperCase()} photo`);
      photoPaths.push(path);
    }
    return { profileId, email };
  };

  const createPendingSetupRows = async (groupId: string, inviterId: string, members: Array<{ profileId: string; email: string }>) => {
    for (const [index, member] of members.entries()) {
      const created = await service.from("invitations").insert({
        email: member.email, first_name: "Verify", last_name: `Pending ${index + 1}`, phone: `+1555555010${index + 1}`,
        intended_role: "couple", campus_id: campusId, group_id: groupId, invited_by: inviterId,
        auth_user_id: member.profileId, status: "pending",
      } as never).select("id").single();
      fail(created.error, `Create pending setup row ${index + 1}`);
      invitationIds.push(id(created.data, `Pending setup row ${index + 1}`));
    }
  };

  const deleteGraph = (intakeId: string) => (service as unknown as {
    rpc(name: "delete_disposable_intake_graph", args: { target_intake_id: string }): Promise<{ data: { profile_ids?: string[]; auth_user_ids?: string[] } | null; error: { message: string } | null }>;
  }).rpc("delete_disposable_intake_graph", { target_intake_id: intakeId });

  const assertGraphRemains = async (intakeId: string, groupId: string, memberIds: string[], label: string) => {
    const [intake, group, memberships, profiles] = await Promise.all([
      service.from("intake_requests" as never).select("id").eq("id", intakeId),
      service.from("groups").select("id").eq("id", groupId),
      service.from("group_members").select("id").eq("group_id", groupId).is("ended_at", null),
      service.from("profiles").select("id").in("id", memberIds),
    ]);
    [intake, group, memberships, profiles].forEach((result) => fail(result.error, `Verify ${label} rollback`));
    if ((intake.data ?? []).length !== 1 || (group.data ?? []).length !== 1 || (memberships.data ?? []).length !== 2 || (profiles.data ?? []).length !== 2) throw new Error(`${label} delete partially mutated the retained graph`);
  };

  const assertNoVerifierArtifacts = async () => {
    const auth = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    fail(auth.error, "Inspect verifier Auth artifacts");
    const checks = await Promise.all([
      service.from("intake_requests" as never).select("id").like("goals", `${verifierPrefix}%`),
      service.from("groups").select("id").like("name", `${verifierPrefix}%`),
      service.from("profiles").select("id").like("email", `${verifierPrefix}%@example.test`),
      service.from("profile_roles").select("profile_id,profiles!profile_roles_profile_id_fkey!inner(email)").like("profiles.email", `${verifierPrefix}%@example.test`),
      service.from("invitations").select("id").like("email", `${verifierPrefix}%@example.test`),
      service.from("group_members").select("id,groups!group_members_group_id_fkey!inner(name)").like("groups.name", `${verifierPrefix}%`),
    ]);
    checks.forEach((result) => fail(result.error, "Inspect verifier-owned database artifacts"));
    if (checks.some((result) => (result.data ?? []).length) || (auth.data.users ?? []).some((user) => user.email?.startsWith(verifierPrefix))) throw new Error("Verifier-owned database or Auth artifacts remain");
    for (const path of photoPaths) {
      const downloaded = await service.storage.from("profile-photos").download(path);
      if (!downloaded.error) throw new Error(`Verifier-owned photo remains at ${path}`);
    }
  };

  const cleanup = async () => {
    if (invitationIds.length) {
      fail((await service.from("audit_events").delete().eq("entity_type", "invitation").in("entity_id", invitationIds)).error, "Remove verifier invitation audit events");
      fail((await service.from("invitations").delete().in("id", invitationIds)).error, "Remove verifier invitations");
    }
    if (intakeIds.length) {
      fail((await service.from("intake_requests" as never).update({ status: "ready_for_review", invited_group_id: null } as never).in("id", intakeIds)).error, "Unlink verifier Intakes");
      fail((await service.from("notification_deliveries" as never).delete().eq("related_entity_type", "intake_request").in("related_entity_id", intakeIds)).error, "Remove verifier notifications");
      fail((await service.from("audit_events").delete().eq("entity_type", "intake_request").in("entity_id", intakeIds)).error, "Remove verifier Intake audit events");
      fail((await service.from("intake_request_status_history" as never).delete().in("intake_request_id", intakeIds)).error, "Remove verifier Intake status history");
      fail((await service.from("intake_requests" as never).delete().in("id", intakeIds)).error, "Remove verifier Intakes");
    }
    if (groupIds.length) {
      fail((await service.from("group_members").delete().in("group_id", groupIds)).error, "Remove verifier memberships");
      fail((await service.from("groups").delete().in("id", groupIds)).error, "Remove verifier Couples");
    }
    if (photoPaths.length) fail((await service.storage.from("profile-photos").remove(photoPaths)).error, "Remove verifier photos");
    await removeAuth(authUserIds);
  };

  let primaryFailure: unknown;
  try {
    const successGroup = await createCouple("full-success");
    const successIntake = await createIntake("full-success", successGroup);
    const first = await createMember("full-success-one", successGroup);
    const second = await createMember("full-success-two", successGroup);
    await createPendingSetupRows(successGroup, first.profileId, [first, second]);
    const successfulDelete = await deleteGraph(successIntake);
    fail(successfulDelete.error, "Super Admin permanent delete of full graph");
    const returned = successfulDelete.data;
    if (!returned || returned.profile_ids?.length !== 2 || returned.auth_user_ids?.length !== 2) throw new Error("Full graph delete did not return both disposable profile and Auth identities");
    const [removedIntake, removedGroup, removedMemberships, removedInvitations] = await Promise.all([
      service.from("intake_requests" as never).select("id").eq("id", successIntake), service.from("groups").select("id").eq("id", successGroup),
      service.from("group_members").select("id").eq("group_id", successGroup), service.from("invitations").select("id").eq("group_id", successGroup),
    ]);
    [removedIntake, removedGroup, removedMemberships, removedInvitations].forEach((result) => fail(result.error, "Verify full graph DB deletion"));
    if ([removedIntake, removedGroup, removedMemberships, removedInvitations].some((result) => (result.data ?? []).length)) throw new Error("Full graph DB deletion did not finish before external cleanup");
    const successPaths = photoPaths.filter((path) => path.includes(first.profileId) || path.includes(second.profileId));
    for (const path of successPaths) {
      const photo = await service.storage.from("profile-photos").download(path);
      if (photo.error) throw new Error("Storage cleanup started before the verifier confirmed DB deletion");
    }
    fail((await service.storage.from("profile-photos").remove(successPaths)).error, "Clean full graph photos after DB delete");
    await removeAuth(returned.auth_user_ids ?? []);
    const profilesAfterAuth = await service.from("profiles").select("id").in("id", [first.profileId, second.profileId]);
    fail(profilesAfterAuth.error, "Verify profiles after Auth cleanup");
    if ((profilesAfterAuth.data ?? []).length) throw new Error("Full graph profiles remained after Auth cleanup");

    const protectedGroup = await createCouple("protected-history");
    const protectedIntake = await createIntake("protected-history", protectedGroup);
    const protectedFirst = await createMember("protected-history-one", protectedGroup);
    const protectedSecond = await createMember("protected-history-two", protectedGroup);
    const protectedDependency = await service.from("invitations").insert({
      email: `${prefix}-protected-history@example.test`, first_name: "Verify", last_name: "Protected History",
      intended_role: "author", campus_id: campusId, invited_by: protectedFirst.profileId,
    } as never).select("id").single();
    fail(protectedDependency.error, "Create protected non-owned invitation");
    invitationIds.push(id(protectedDependency.data, "Protected non-owned invitation"));
    const protectedDelete = await deleteGraph(protectedIntake);
    if (!protectedDelete.error?.message.includes("intake_delete_blocker:shared_or_non_owned_invitation")) throw new Error("Protected non-owned invitation did not return its specific blocker");
    await assertGraphRemains(protectedIntake, protectedGroup, [protectedFirst.profileId, protectedSecond.profileId], "Protected history");

    const sharedGroup = await createCouple("cross-team");
    const sharedIntake = await createIntake("cross-team", sharedGroup);
    const sharedFirst = await createMember("cross-team-one", sharedGroup);
    const sharedSecond = await createMember("cross-team-two", sharedGroup);
    const otherGroup = await createCouple("cross-team-other");
    fail((await service.from("group_members").insert({ group_id: otherGroup, profile_id: sharedFirst.profileId })).error, "Create cross-team membership");
    const crossTeamDelete = await deleteGraph(sharedIntake);
    if (!crossTeamDelete.error?.message.includes("intake_delete_blocker:member_in_another_active_team")) throw new Error("Cross-team membership did not return its specific blocker");
    await assertGraphRemains(sharedIntake, sharedGroup, [sharedFirst.profileId, sharedSecond.profileId], "Cross-team");
    const otherGroupRemaining = await service.from("groups").select("id").eq("id", otherGroup);
    fail(otherGroupRemaining.error, "Verify second cross-team group");
    if ((otherGroupRemaining.data ?? []).length !== 1) throw new Error("Cross-team secondary group was unexpectedly changed");
    console.log("DEV Intake permanent-delete verifier passed.");
  } catch (error) {
    primaryFailure = error;
  }

  let teardownFailure: unknown;
  try {
    await cleanup();
    await assertNoVerifierArtifacts();
    await cleanup();
    await assertNoVerifierArtifacts();
  } catch (error) {
    teardownFailure = error;
  }
  if (primaryFailure && teardownFailure) throw new AggregateError([primaryFailure, teardownFailure], "Intake permanent-delete verifier and teardown both failed");
  if (primaryFailure) throw primaryFailure;
  if (teardownFailure) throw teardownFailure;
}

await main();
