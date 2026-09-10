import { createClient } from "@supabase/supabase-js";

import { validateInvitation } from "../features/people/invitation-validation.ts";
import { coupleDisplayName, groupedRoleNames } from "../features/people/types.ts";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-intake-handoff-${Date.now()}`;

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message: string } | null };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function rows(value: unknown) { return Array.isArray(value) ? value as Row[] : []; }
function value(row: Row, key: string) { return typeof row[key] === "string" ? row[key] : null; }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Intake invite handoff verification refused: configured project is not approved DEV.");

  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (email: string, password: string) => createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email, password });
  const adminSession = await signIn(required("TEST_ADMIN_EMAIL"), required("TEST_ADMIN_PASSWORD"));
  const coachSession = await signIn(required("TEST_COACH_EMAIL"), required("TEST_COACH_PASSWORD"));
  fail(adminSession.error, "Unable to sign in DEV Admin"); fail(coachSession.error, "Unable to sign in DEV Coach");
  if (!adminSession.data.session || !coachSession.data.session) throw new Error("DEV verification sessions are missing");
  const client = (token: string) => createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const admin = client(adminSession.data.session.access_token);
  const coach = client(coachSession.data.session.access_token);
  const requestIds: string[] = [];
  const invitationIds: string[] = [];
  const groupIds: string[] = [];

  const action = (actor: ReturnType<typeof client>, requestId: string, targetAction: string, reasonCode: string | null = null, reasonDetail: string | null = null) => actor.rpc("take_intake_request_action" as never, { target_request_id: requestId, target_action: targetAction, target_reason_code: reasonCode, target_reason_detail: reasonDetail } as never) as unknown as Promise<RpcResult>;
  const invite = (actor: ReturnType<typeof client>, requestId: string) => actor.rpc("invite_intake_request" as never, { target_request_id: requestId } as never) as unknown as Promise<RpcResult>;
  const createRequest = async (suffix: string) => {
    const campus = await service.from("campuses").select("id").eq("active", true).limit(1).single();
    fail(campus.error, "Unable to read an active DEV Campus");
    if (!campus.data) throw new Error("An active DEV Campus is required");
    const created = await service.from("intake_requests" as never).insert({ campus_id: campus.data.id, relationship_status: "married", currently_working_with_counselor: false, requested_support: ["lay_counselor"], goals: "Verify intake invite handoff", referral_source: "website" } as never).select("id,status").single();
    fail(created.error, "Unable to create deterministic Intake Request");
    const request = created.data as unknown as Row;
    const requestId = value(request, "id");
    if (!requestId || value(request, "status") !== "ready_for_review") throw new Error("Deterministic Intake Request did not start ready for review");
    requestIds.push(requestId);
    const people = await service.from("intake_request_people" as never).insert([
      { intake_request_id: requestId, person_position: "requester", first_name: "Requester", last_name: `${prefix}-${suffix}`, email: `${prefix}-${suffix}-requester@example.test`, phone: "555-0101", city: "Test City", resonate_connections: ["Resonate Member"] },
      { intake_request_id: requestId, person_position: "partner", first_name: "Partner", last_name: `${prefix}-${suffix}`, email: `${prefix}-${suffix}-partner@example.test`, phone: "555-0102", city: "Test City", resonate_connections: ["Attend church occasionally"] },
    ] as never);
    fail(people.error, "Unable to create deterministic Intake Request people");
    return { id: requestId, emails: [`${prefix}-${suffix}-requester@example.test`, `${prefix}-${suffix}-partner@example.test`] };
  };

  try {
    const handoff = await createRequest("handoff");
    const unauthorizedStart = await action(coach, handoff.id, "start_review");
    if (!unauthorizedStart.error) throw new Error("Unauthorized operational role started Intake review");
    const invalidInvite = await invite(admin, handoff.id);
    if (!invalidInvite.error) throw new Error("Send Invite succeeded before review");
    const manualInvited = await action(admin, handoff.id, "invited");
    if (!manualInvited.error) throw new Error("Manual transition to Invited succeeded");

    fail((await action(admin, handoff.id, "start_review")).error, "Admin could not Start Review");
    const reviewHistory = await service.from("intake_request_status_history" as never).select("from_status,to_status,note").eq("intake_request_id", handoff.id);
    fail(reviewHistory.error, "Unable to read Start Review history");
    if (!rows(reviewHistory.data).some((item) => value(item, "from_status") === "ready_for_review" && value(item, "to_status") === "under_review" && value(item, "note") === "Review Started")) throw new Error("Start Review history is missing");
    const reviewAudit = await service.from("audit_events").select("id").eq("entity_id", handoff.id).eq("event_type", "intake_request.start_review");
    fail(reviewAudit.error, "Unable to read Start Review audit event"); if ((reviewAudit.data ?? []).length !== 1) throw new Error("Start Review audit event is missing");
    const unauthorizedInvite = await invite(coach, handoff.id);
    if (!unauthorizedInvite.error) throw new Error("Unauthorized operational role sent an Intake invitation");

    const firstInvite = await invite(admin, handoff.id);
    fail(firstInvite.error, "Send Invite domain action failed");
    const invitePayload = firstInvite.data as { group_id?: string; invitation_ids?: string[]; created?: boolean } | null;
    if (!invitePayload?.created || !invitePayload.group_id || invitePayload.invitation_ids?.length !== 2) throw new Error("Send Invite did not return one newly created Couple group and two invitations");
    groupIds.push(invitePayload.group_id); invitationIds.push(...invitePayload.invitation_ids);
    const linked = await service.from("intake_requests" as never).select("status,invited_group_id").eq("id", handoff.id).single();
    fail(linked.error, "Unable to read Intake handoff linkage");
    const linkedRow = linked.data as unknown as Row;
    if (value(linkedRow, "status") !== "invited" || value(linkedRow, "invited_group_id") !== invitePayload.group_id) throw new Error("Intake was not linked to its invited Couple group");
    const invitations = await service.from("invitations").select("id,email,first_name,last_name,status,intended_role,group_id,auth_user_id").in("id", invitePayload.invitation_ids);
    fail(invitations.error, "Unable to read Couple invitations");
    const invitationRows = rows(invitations.data);
    if (invitationRows.length !== 2 || invitationRows.some((item) => value(item, "status") !== "pending" || value(item, "intended_role") !== "couple" || value(item, "group_id") !== invitePayload.group_id || item.auth_user_id !== null)) throw new Error("Couple invitations are not pending, authoritative, and unactivated");
    const group = await service.from("groups").select("group_type").eq("id", invitePayload.group_id).single();
    fail(group.error, "Unable to read Couple group"); if ((group.data as { group_type?: string } | null)?.group_type !== "couple") throw new Error("Send Invite did not create a Couple group");
    const profiles = await service.from("profiles").select("id,email").in("email", handoff.emails);
    fail(profiles.error, "Unable to check pending-profile state"); if ((profiles.data ?? []).length !== 0) throw new Error("Send Invite created profiles before activation");
    const handoffHistory = await service.from("intake_request_status_history" as never).select("from_status,to_status,note").eq("intake_request_id", handoff.id);
    fail(handoffHistory.error, "Unable to read Couple Invited history");
    if (!rows(handoffHistory.data).some((item) => value(item, "from_status") === "under_review" && value(item, "to_status") === "invited" && value(item, "note") === "Couple Invited")) throw new Error("Couple Invited history is missing");
    const audits = await service.from("audit_events").select("event_type,entity_id").or(`entity_id.eq.${handoff.id},entity_id.in.(${invitePayload.invitation_ids.join(",")})`);
    fail(audits.error, "Unable to read intake handoff audit events");
    const auditRows = rows(audits.data);
    if (auditRows.filter((item) => value(item, "event_type") === "invitation.created").length !== 2 || !auditRows.some((item) => value(item, "event_type") === "intake_request.invited" && value(item, "entity_id") === handoff.id)) throw new Error("Expected intake handoff audit events are missing");

    const secondInvite = await invite(admin, handoff.id);
    fail(secondInvite.error, "Repeated Send Invite failed instead of reusing the handoff");
    const repeatedPayload = secondInvite.data as { group_id?: string; invitation_ids?: string[]; created?: boolean } | null;
    if (repeatedPayload?.created || repeatedPayload?.group_id !== invitePayload.group_id || repeatedPayload.invitation_ids?.length !== 2) throw new Error("Repeated Send Invite did not reuse the existing linkage");
    const groupCount = await service.from("groups").select("id", { count: "exact", head: true }).eq("id", invitePayload.group_id);
    const invitationCount = await service.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", invitePayload.group_id);
    fail(groupCount.error, "Unable to count Couple groups"); fail(invitationCount.error, "Unable to count Couple invitations");
    if (groupCount.count !== 1 || invitationCount.count !== 2) throw new Error("Repeated Send Invite created duplicate group or invitations");
    const groupRoles = groupedRoleNames([], invitationRows);
    const name = coupleDisplayName("Pending Couple invitation", [], invitationRows.map((item) => ({ firstName: value(item, "first_name"), lastName: value(item, "last_name"), email: value(item, "email") })));
    if (name !== `Requester ${prefix}-handoff & Partner ${prefix}-handoff` || groupRoles.length !== 1 || groupRoles[0] !== "couple") throw new Error("Pending Couple does not resolve correctly for People & Teams");
    if (groupedRoleNames([{ profile_roles: [{ role: "couple" }] }], [{ intended_role: "couple" }]).join(",") !== "couple") throw new Error("Mixed People & Teams role aggregation is not deduplicated");

    const standardClose = await createRequest("standard-close");
    fail((await action(admin, standardClose.id, "start_review")).error, "Unable to Start Review before standard close");
    const invalidOther = await action(admin, standardClose.id, "close", "other", null);
    if (!invalidOther.error) throw new Error("Close Request accepted Other without supporting detail");
    fail((await action(admin, standardClose.id, "close", "unable_to_contact")).error, "Standard Close Request failed");
    const closedHistory = await service.from("intake_request_status_history" as never).select("to_status,reason_code,reason_detail").eq("intake_request_id", standardClose.id);
    fail(closedHistory.error, "Unable to read standard close history");
    if (!rows(closedHistory.data).some((item) => value(item, "to_status") === "closed" && value(item, "reason_code") === "unable_to_contact" && item.reason_detail === null)) throw new Error("Standard close reason was not preserved in immutable history");
    fail((await action(admin, standardClose.id, "reopen")).error, "Reopen for Review failed");
    const reopened = await service.from("intake_requests" as never).select("status").eq("id", standardClose.id).single();
    fail(reopened.error, "Unable to read reopened Intake Request"); if ((reopened.data as { status?: string } | null)?.status !== "under_review") throw new Error("Reopen did not return request to Under Review");
    const reopenHistory = await service.from("intake_request_status_history" as never).select("to_status,note,reason_code").eq("intake_request_id", standardClose.id);
    fail(reopenHistory.error, "Unable to read reopen history");
    if (!rows(reopenHistory.data).some((item) => value(item, "to_status") === "closed" && value(item, "reason_code") === "unable_to_contact") || !rows(reopenHistory.data).some((item) => value(item, "to_status") === "under_review" && value(item, "note") === "Request Reopened")) throw new Error("Reopen did not preserve close history and append a new history row");

    const otherClose = await createRequest("other-close");
    fail((await action(admin, otherClose.id, "start_review")).error, "Unable to Start Review before Other close");
    fail((await action(admin, otherClose.id, "close", "other", "Verifier supporting detail")).error, "Other Close Request failed");
    const otherHistory = await service.from("intake_request_status_history" as never).select("to_status,reason_code,reason_detail").eq("intake_request_id", otherClose.id);
    fail(otherHistory.error, "Unable to read Other close history");
    if (!rows(otherHistory.data).some((item) => value(item, "to_status") === "closed" && value(item, "reason_code") === "other" && value(item, "reason_detail") === "Verifier supporting detail")) throw new Error("Other close reason and detail were not preserved");

    if (!validateInvitation("couple", "campus", [{ firstName: "One", lastName: "Person", email: "one@example.test" }, { firstName: "Two", lastName: "Person", email: "two@example.test" }]).role) throw new Error("Generic Invite People validation accepts Couple");
    const genericCouple = await fetch(`${url}/rest/v1/rpc/create_invitations`, { method: "POST", headers: { apikey: publishableKey, authorization: `Bearer ${adminSession.data.session.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ payload: { role: "couple", campus_id: (await service.from("campuses").select("id").eq("active", true).limit(1).single()).data?.id, invitees: [{ email: `${prefix}-generic-1@example.test`, first_name: "One", last_name: "Person" }, { email: `${prefix}-generic-2@example.test`, first_name: "Two", last_name: "Person" }] } }) });
    if (genericCouple.ok) throw new Error("Generic Invite People RPC accepts Couple");
    console.log("DEV intake invite handoff verified.");
  } finally {
    if (requestIds.length) await service.from("audit_events").delete().in("entity_id", requestIds);
    if (invitationIds.length) await service.from("audit_events").delete().in("entity_id", invitationIds);
    if (requestIds.length) await service.from("intake_request_status_history" as never).delete().in("intake_request_id", requestIds);
    if (invitationIds.length) await service.from("invitations").delete().in("id", invitationIds);
    if (requestIds.length) await service.from("intake_requests" as never).delete().in("id", requestIds);
    if (groupIds.length) await service.from("groups").delete().in("id", groupIds);
  }
}

await main();
