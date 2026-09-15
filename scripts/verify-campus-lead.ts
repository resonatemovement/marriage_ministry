import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { eligibleIntakeRecipients, type IntakeRecipientProfile } from "../features/notifications/recipients.ts";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import { availableWorkspacesForRoles, defaultWorkspaceForRoles } from "../lib/workspaces.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-campus-lead-${Date.now()}`;
type Result = { error: { message: string } | null };
type Row = Record<string, unknown>;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function rowId(row: unknown, label: string) { const id = (row as Row | null)?.id; if (typeof id !== "string") throw new Error(`${label} id is missing`); return id; }

function client(url: string, key: string) { return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function signedIn(url: string, key: string, email: string, password: string) {
  const result = await client(url, key).auth.signInWithPassword({ email, password });
  fail(result.error, `Unable to sign in ${email}`);
  if (!result.data.session) throw new Error(`Missing session for ${email}`);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${result.data.session.access_token}` } } });
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Campus Lead verification refused: configured project is not approved DEV.");
  const service = client(url, required("SUPABASE_SECRET_KEY"));
  const administrator = await signedIn(url, publishableKey, required("TEST_ADMIN_EMAIL").toLowerCase(), required("TEST_ADMIN_PASSWORD"));
  if (defaultWorkspaceForRoles(["campus_lead"])?.id !== "campus_lead" || availableWorkspacesForRoles(["campus_lead"]).some((workspace) => workspace.id === "coach") || defaultWorkspaceForRoles(["campus_lead", "admin"])?.id !== "admin") throw new Error("Campus Lead workspace independence regressed");
  const ids = { campuses: [] as string[], users: [] as string[], profiles: [] as string[], groups: [] as string[], intakes: [] as string[], invitations: [] as string[], assignments: [] as string[] };
  const password = `Verify-${crypto.randomUUID()}!`;
  const createAuthProfile = async (suffix: string, campusId: string, roles: string[]) => {
    const email = `${prefix}-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.test`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    fail(created.error, `Unable to create ${suffix} Auth user`); if (!created.data.user) throw new Error(`${suffix} Auth user is missing`);
    const profileId = created.data.user.id; ids.users.push(profileId); ids.profiles.push(profileId);
    fail((await service.from("profiles").upsert({ id: profileId, campus_id: campusId, email, first_name: "Verify", last_name: suffix, status: "active", deactivated_at: null }, { onConflict: "id" }).select("id").single()).error, `Unable to create ${suffix} profile`);
    for (const role of roles) fail((await service.from("profile_roles").insert({ profile_id: profileId, role, assigned_by: profileId } as never)).error, `Unable to assign ${role} to ${suffix}`);
    return { profileId, email };
  };
  const createCampus = async (suffix: string) => {
    const result = await service.from("campuses").insert({ name: `${prefix} ${suffix}`, code: `${prefix}-${suffix}`.slice(0, 48), active: true }).select("id").single();
    fail(result.error, `Unable to create Campus ${suffix}`); const id = rowId(result.data, `Campus ${suffix}`); ids.campuses.push(id); return id;
  };
  const createIntake = async (campusId: string, suffix: string) => {
    const result = await service.from("intake_requests" as never).insert({ campus_id: campusId, relationship_status: "married", currently_working_with_counselor: false, requested_support: ["lay_counselor"], goals: `${prefix} ${suffix}`, referral_source: "website" } as never).select("id").single();
    fail(result.error, `Unable to create Intake ${suffix}`); const id = rowId(result.data, `Intake ${suffix}`); ids.intakes.push(id);
    fail((await service.from("intake_request_people" as never).insert([{ intake_request_id: id, person_position: "requester", first_name: "Verify", last_name: `${suffix} One`, email: `${prefix}-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-one@example.test`, phone: "555-0101", city: "Test City", resonate_connections: ["member"] }, { intake_request_id: id, person_position: "partner", first_name: "Verify", last_name: `${suffix} Two`, email: `${prefix}-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-two@example.test`, phone: "555-0102", city: "Test City", resonate_connections: ["mc"] }] as never)).error, `Unable to create Intake ${suffix} people`);
    return id;
  };
  const createGroup = async (campusId: string, type: "coach_team" | "couple" | "campus_lead_team", suffix: string) => {
    const result = await service.from("groups").insert({ campus_id: campusId, group_type: type as "coach_team" | "couple", name: `${prefix} ${suffix}` }).select("id").single();
    fail(result.error, `Unable to create ${suffix} group`); const id = rowId(result.data, `${suffix} group`); ids.groups.push(id); return id;
  };
  try {
    const [campusA, campusB] = await Promise.all([createCampus("Campus A"), createCampus("Campus B")]);

    // The public RPC is the authoritative invitation path; validate cardinality and campus requirements before accepting a fixture invite.
    const invalidNoCampus = await (administrator as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("create_invitations", { payload: { role: "campus_lead", invitees: [{ email: `${prefix}-missing@example.test`, first_name: "Missing", last_name: "Campus" }] } });
    if (!invalidNoCampus.error) throw new Error("Campus Lead invitation accepted a missing campus");
    const invalidOnePerson = await (administrator as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("create_invitations", { payload: { role: "campus_lead", campus_id: campusA, invitees: [{ email: `${prefix}-one@example.test`, first_name: "One", last_name: "Lead" }] } });
    if (!invalidOnePerson.error) throw new Error("Campus Lead invitation accepted one invitee");
    const acceptedEmails = [`${prefix}-accepted-one@example.test`, `${prefix}-accepted-two@example.test`];
    const invitationResult = await (administrator as unknown as { rpc(name: string, args: Row): Promise<{ data: { invitation_ids: string[]; group_id: string | null } | null; error: { message: string } | null }> }).rpc("create_invitations", { payload: { role: "campus_lead", campus_id: campusA, invitees: acceptedEmails.map((email, index) => ({ email, first_name: "Accepted", last_name: `Lead ${index + 1}` })) } });
    fail(invitationResult.error, "Admin could not create Campus Lead team invitation"); const invitationIds = invitationResult.data?.invitation_ids ?? []; const invitedTeamId = invitationResult.data?.group_id; if (invitationIds.length !== 2 || !invitedTeamId) throw new Error("Campus Lead invitation must create one team and two invitations"); ids.invitations.push(...invitationIds); ids.groups.push(invitedTeamId);
    const acceptedUsers = await Promise.all(acceptedEmails.map((email) => service.auth.admin.createUser({ email, password, email_confirm: true }))); if (acceptedUsers.some((result) => result.error || !result.data.user)) throw new Error("Unable to create invited Campus Lead Auth users");
    for (let index = 0; index < invitationIds.length; index += 1) { const user = acceptedUsers[index]!.data.user!; ids.users.push(user.id); ids.profiles.push(user.id); fail((await (administrator as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("record_invitation_delivery", { target_invitation_id: invitationIds[index]!, target_auth_user_id: user.id, succeeded: true, failure_category: null })).error, "Unable to associate Campus Lead delivery"); const acceptedClient = await signedIn(url, publishableKey, acceptedEmails[index]!, password); fail((await (acceptedClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("accept_invitation", {})).error, "Campus Lead invitation acceptance failed"); fail((await (acceptedClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("accept_invitation", {})).error, "Campus Lead invitation acceptance retry failed"); }
    const invitedMembers = await service.from("group_members").select("profile_id").eq("group_id", invitedTeamId).is("ended_at", null); fail(invitedMembers.error, "Unable to read accepted Campus Lead team"); if ((invitedMembers.data ?? []).length !== 2) throw new Error("Accepted Campus Lead team must have two members");
    for (const user of acceptedUsers) { const profileId = user.data.user!.id; const scope = await service.from("campus_lead_assignments" as never).select("id,campus_id").eq("profile_id", profileId).is("ended_at", null); fail(scope.error, "Unable to read accepted Campus Lead scope"); if ((scope.data ?? []).length !== 1 || (scope.data as unknown as Row[])[0]?.campus_id !== campusA) throw new Error("Acceptance did not establish exactly one Campus A scope"); }

    const [leadA, leadAPartner, leadB, superLead] = await Promise.all([createAuthProfile("Lead A", campusA, ["campus_lead"]), createAuthProfile("Lead A Partner", campusA, ["campus_lead"]), createAuthProfile("Lead B", campusB, ["campus_lead"]), createAuthProfile("Super Lead", campusA, ["super_admin", "campus_lead"])]);
    const leadATeam = await createGroup(campusA, "campus_lead_team", "Campus Lead Team A");
    fail((await service.from("group_members").insert([{ group_id: leadATeam, profile_id: leadA.profileId }, { group_id: leadATeam, profile_id: leadAPartner.profileId }])).error, "Unable to create Campus A Campus Lead team");
    const [intakeA, intakeB, intakeC, coachA, coachB, coupleA, coupleB] = await Promise.all([createIntake(campusA, "Intake A"), createIntake(campusB, "Intake B"), createIntake(campusB, "Intake C"), createGroup(campusA, "coach_team", "Coach A"), createGroup(campusB, "coach_team", "Coach B"), createGroup(campusA, "couple", "Couple A"), createGroup(campusB, "couple", "Couple B")]);
    const leadAClient = await signedIn(url, publishableKey, leadA.email, password);
    const leadBClient = await signedIn(url, publishableKey, leadB.email, password);
    const superLeadClient = await signedIn(url, publishableKey, superLead.email, password);
    const read = async (table: string, id: string) => (leadAClient.from(table as never).select("id").eq("id", id) as unknown as Promise<{ data: unknown[] | null; error: { message: string } | null }>);
    for (const [table, own, other, label] of [["intake_requests", intakeA, intakeB, "Intake"], ["groups", coachA, coachB, "Coach"], ["groups", coupleA, coupleB, "Couple"]] as const) {
      const [allowed, denied] = await Promise.all([read(table, own), read(table, other)]); fail(allowed.error, `${label} own-campus lookup failed`); fail(denied.error, `${label} cross-campus lookup failed unexpectedly`);
      if ((allowed.data ?? []).length !== 1 || (denied.data ?? []).length !== 0) throw new Error(`${label} RLS campus isolation failed`);
    }
    const intakeQueue = await leadAClient.from("intake_requests" as never).select("id").in("id", [intakeA, intakeB]); fail(intakeQueue.error, "Campus Lead Intake queue failed"); if ((intakeQueue.data ?? []).length !== 1) throw new Error("Campus Lead Intake queue was not isolated");
    const adminRead = await administrator.from("intake_requests" as never).select("id").in("id", [intakeA, intakeB]); fail(adminRead.error, "Admin Intake read failed"); if ((adminRead.data ?? []).length !== 2) throw new Error("Admin global Intake visibility regressed");
    const actionRpc = (requestId: string, action: "start_review" | "close" | "reopen") => (leadAClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("take_intake_request_action", { target_request_id: requestId, target_action: action, target_reason_code: action === "close" ? "duplicate_request" : null, target_reason_detail: null });
    for (const action of ["start_review", "close", "reopen"] as const) fail((await actionRpc(intakeA, action)).error, `Campus Lead could not ${action} an own-campus Intake Request`);
    const ownInvite = await (leadAClient as unknown as { rpc(name: string, args: Row): Promise<{ data: { group_id: string; invitation_ids: string[] } | null; error: { message: string } | null }> }).rpc("invite_intake_request", { target_request_id: intakeA });
    fail(ownInvite.error, "Campus Lead could not invite an own-campus Intake Request");
    if (!ownInvite.data?.group_id || ownInvite.data.invitation_ids.length !== 2) throw new Error("Campus Lead invite fixture is incomplete");
    ids.groups.push(ownInvite.data.group_id); ids.invitations.push(...ownInvite.data.invitation_ids);
    for (const action of ["start_review", "close", "reopen"] as const) { const result = await actionRpc(intakeB, action); if (!result.error) throw new Error(`Campus Lead could ${action} a cross-campus Intake Request`); }
    const crossCampusInvite = await (leadAClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("invite_intake_request", { target_request_id: intakeB }); if (!crossCampusInvite.error) throw new Error("Campus Lead could invite a cross-campus Intake Request");
    const noTeamInvite = await (leadBClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("invite_intake_request", { target_request_id: intakeB }); if (!noTeamInvite.error) throw new Error("Campus Lead without an active Campus Lead team could invite an Intake Request");
    const adminInvite = await (administrator as unknown as { rpc(name: string, args: Row): Promise<{ data: { group_id: string; invitation_ids: string[] } | null; error: { message: string } | null }> }).rpc("invite_intake_request", { target_request_id: intakeB }); fail(adminInvite.error, "Admin could not invite a cross-campus Intake Request"); if (!adminInvite.data?.group_id || adminInvite.data.invitation_ids.length !== 2) throw new Error("Admin cross-campus invite fixture is incomplete"); ids.groups.push(adminInvite.data.group_id); ids.invitations.push(...adminInvite.data.invitation_ids);
    const superInvite = await (superLeadClient as unknown as { rpc(name: string, args: Row): Promise<{ data: { group_id: string; invitation_ids: string[] } | null; error: { message: string } | null }> }).rpc("invite_intake_request", { target_request_id: intakeC }); fail(superInvite.error, "Super Admin could not invite a cross-campus Intake Request"); if (!superInvite.data?.group_id || superInvite.data.invitation_ids.length !== 2) throw new Error("Super Admin cross-campus invite fixture is incomplete"); ids.groups.push(superInvite.data.group_id); ids.invitations.push(...superInvite.data.invitation_ids);
    for (const [rpc, args] of [["delete_intake_request", { target_request_id: intakeA }]] as const) { const result = await (leadAClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc(rpc, args); if (!result.error) throw new Error(`Campus Lead could invoke ${rpc}`); }
    const genericInvite = await (leadAClient as unknown as { rpc(name: string, args: Row): Promise<Result> }).rpc("create_invitations", { payload: { role: "author", campus_id: campusA, invitees: [{ email: `${prefix}-staff@example.test`, first_name: "Staff", last_name: "Invite" }] } }); if (!genericInvite.error) throw new Error("Campus Lead could create a generic staff invitation");
    const spoof = await leadAClient.from("campus_lead_assignments" as never).select("id").eq("profile_id", leadB.profileId); fail(spoof.error, "Campus Lead assignment read failed"); if ((spoof.data ?? []).length !== 0) throw new Error("Campus Lead could spoof another profile scope");

    const scopeA = await service.from("campus_lead_assignments" as never).select("id").eq("profile_id", leadA.profileId).eq("campus_id", campusA).is("ended_at", null).single(); fail(scopeA.error, "Campus A assignment missing"); const assignmentId = rowId(scopeA.data, "Campus A assignment"); ids.assignments.push(assignmentId);
    fail((await service.from("campus_lead_assignments" as never).update({ ended_at: new Date().toISOString() }).eq("id", assignmentId)).error, "Unable to end Campus A assignment"); if (((await read("intake_requests", intakeA)).data ?? []).length !== 0) throw new Error("Ended Campus Lead assignment retained scope");
    fail((await service.from("campus_lead_assignments" as never).update({ ended_at: null }).eq("id", assignmentId)).error, "Unable to restore Campus A assignment");
    fail((await service.from("profiles").update({ status: "deactivated", deactivated_at: new Date().toISOString() }).eq("id", leadA.profileId)).error, "Unable to deactivate Campus Lead"); if (((await read("intake_requests", intakeA)).data ?? []).length !== 0) throw new Error("Deactivated Campus Lead retained scope");
    fail((await service.from("profiles").update({ status: "active", deactivated_at: null }).eq("id", leadA.profileId)).error, "Unable to reactivate Campus Lead");
    fail((await service.from("profile_roles").delete().eq("profile_id", leadA.profileId).eq("role", "campus_lead")).error, "Unable to remove Campus Lead role"); if (((await read("intake_requests", intakeA)).data ?? []).length !== 0) throw new Error("Role-less profile retained Campus Lead scope");
    fail((await service.from("profile_roles").insert({ profile_id: leadA.profileId, role: "campus_lead", assigned_by: leadA.profileId } as never)).error, "Unable to restore Campus Lead role");

    const adminLead = await createAuthProfile("Admin Lead", campusA, ["admin", "campus_lead"]);
    const profiles: IntakeRecipientProfile[] = [{ id: leadA.profileId, email: leadA.email, status: "active", profile_roles: [{ role: "campus_lead" }], campus_lead_assignments: [{ campus_id: campusA, ended_at: null }] }, { id: leadB.profileId, email: leadB.email, status: "active", profile_roles: [{ role: "campus_lead" }], campus_lead_assignments: [{ campus_id: campusB, ended_at: null }] }, { id: adminLead.profileId, email: adminLead.email, status: "active", profile_roles: [{ role: "admin" }, { role: "campus_lead" }], campus_lead_assignments: [{ campus_id: campusA, ended_at: null }] }, { id: superLead.profileId, email: superLead.email, status: "active", profile_roles: [{ role: "super_admin" }, { role: "campus_lead" }], campus_lead_assignments: [{ campus_id: campusA, ended_at: null }] }, { id: "inactive", email: "inactive@example.test", status: "deactivated", profile_roles: [{ role: "campus_lead" }], campus_lead_assignments: [{ campus_id: campusA, ended_at: null }] }];
    const recipients = eligibleIntakeRecipients(profiles, campusA); const emails = recipients.map((recipient) => recipient.email);
    if (!emails.includes(leadA.email) || emails.includes(leadB.email) || emails.length !== new Set(emails).size || !emails.includes(adminLead.email) || !emails.includes(superLead.email)) throw new Error("Campus Lead notification recipient scoping or deduplication failed");
    console.log("DEV Campus Lead invitation, RLS isolation, mutation denial, scope security, and notification recipient verification passed.");
  } finally {
    if (ids.intakes.length) fail((await service.from("intake_requests" as never).update({ status: "ready_for_review", invited_group_id: null } as never).in("id", ids.intakes)).error, "Reset verifier intakes");
    const ownedInvitations = ids.profiles.length ? await service.from("invitations").select("id").in("invited_by", ids.profiles) : { data: [], error: null };
    fail(ownedInvitations.error, "Read verifier profile invitations");
    const invitationIds = [...new Set([...ids.invitations, ...(ownedInvitations.data ?? []).map((row) => row.id)])];
    if (invitationIds.length) { fail((await service.from("audit_events").delete().in("entity_id", invitationIds)).error, "Delete verifier invitation audit events"); fail((await service.from("invitations").delete().in("id", invitationIds)).error, "Delete verifier invitations"); }
    if (ids.intakes.length) { fail((await service.from("audit_events").delete().in("entity_id", ids.intakes)).error, "Delete verifier intake audit events"); fail((await service.from("intake_request_status_history" as never).delete().in("intake_request_id", ids.intakes)).error, "Delete verifier intake history"); fail((await service.from("notification_deliveries" as never).delete().eq("related_entity_type", "intake_request").in("related_entity_id", ids.intakes)).error, "Delete verifier intake notifications"); fail((await service.from("intake_requests" as never).delete().in("id", ids.intakes)).error, "Delete verifier intakes"); }
    const relationshipCleanup = await (service as unknown as { rpc(name: "cleanup_verifier_relationship_artifacts"): Promise<Result> }).rpc("cleanup_verifier_relationship_artifacts");
    fail(relationshipCleanup.error, "Clean verifier-owned protected relationships");
    if (ids.groups.length) { fail((await service.from("group_members").delete().in("group_id", ids.groups)).error, "Delete verifier memberships"); fail((await service.from("groups").delete().in("id", ids.groups)).error, "Delete verifier groups"); }
    if (ids.profiles.length) { fail((await service.from("campus_lead_assignments" as never).delete().in("profile_id", ids.profiles)).error, "Delete verifier campus scopes"); fail((await service.from("profile_roles").delete().in("profile_id", ids.profiles)).error, "Delete verifier roles"); fail((await service.from("profiles").delete().in("id", ids.profiles)).error, "Delete verifier profiles"); }
    for (const userId of ids.users) fail((await service.auth.admin.deleteUser(userId)).error, "Delete verifier Auth user");
    if (ids.campuses.length) fail((await service.from("campuses").delete().in("id", ids.campuses)).error, "Delete verifier campuses");
  }
}

await main();
