import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-intake-delete-${Date.now()}`;
type Row = Record<string, unknown>;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function id(value: unknown) { return typeof value === "string" ? value : null; }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Intake delete verification refused: configured project is not approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const campus = await service.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campus.error, "Unable to read active DEV Campus"); if (!campus.data) throw new Error("Active DEV Campus is missing");
  const signIn = async (emailName: string, passwordName: string) => {
    const user = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await user.auth.signInWithPassword({ email: required(emailName), password: required(passwordName) });
    fail(result.error, `Unable to sign in ${emailName}`); if (!result.data.session) throw new Error(`${emailName} session is missing`);
    return createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${result.data.session.access_token}` } } });
  };
  const superAdmin = await signIn("TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD");
  const nonSuperAdmins = await Promise.all([
    signIn("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"),
    signIn("TEST_COACH_EMAIL", "TEST_COACH_PASSWORD"),
    signIn("TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD"),
    signIn("TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD"),
    signIn("TEST_AUTHOR_EMAIL", "TEST_AUTHOR_PASSWORD"),
  ]);
  const requestIds: string[] = [];
  const groupIds: string[] = [];
  const invitationIds: string[] = [];

  const createRequest = async (suffix: string) => {
    const created = await service.from("intake_requests" as never).insert({ campus_id: campus.data!.id, relationship_status: "married", currently_working_with_counselor: false, requested_support: ["lay_counselor"], goals: `Delete verifier ${suffix}`, referral_source: "website" } as never).select("id,status").single();
    fail(created.error, `Unable to create ${suffix} Intake Request`);
    const requestId = id((created.data as unknown as Row)?.id); if (!requestId) throw new Error(`${suffix} Intake Request id is missing`); requestIds.push(requestId);
    const people = await service.from("intake_request_people" as never).insert([
      { intake_request_id: requestId, person_position: "requester", first_name: "Delete", last_name: `${prefix}-${suffix}`, email: `${prefix}-${suffix}-one@example.test`, phone: "555-0101", city: "Test City", resonate_connections: ["member"] },
      { intake_request_id: requestId, person_position: "partner", first_name: "Verifier", last_name: `${prefix}-${suffix}`, email: `${prefix}-${suffix}-two@example.test`, phone: "555-0102", city: "Test City", resonate_connections: ["mc"] },
    ] as never);
    fail(people.error, `Unable to create ${suffix} people`);
    return requestId;
  };
  const rpc = (client: unknown, requestId: string) => (client as { rpc: (...args: never[]) => unknown }).rpc("delete_intake_request" as never, { target_request_id: requestId } as never) as Promise<{ data: unknown; error: { message: string } | null }>;
  const transition = (requestId: string, action: string) => superAdmin.rpc("take_intake_request_action" as never, { target_request_id: requestId, target_action: action, target_reason_code: action === "close" ? "duplicate_request" : null, target_reason_detail: null } as never) as unknown as Promise<{ error: { message: string } | null }>;

  try {
    for (const status of ["ready", "review", "closed"] as const) {
      const requestId = await createRequest(status);
      if (status === "review" || status === "closed") fail((await transition(requestId, "start_review")).error, `Unable to start ${status} request review`);
      if (status === "closed") fail((await transition(requestId, "close")).error, "Unable to close verifier request");
      const notification = await service.from("notification_deliveries" as never).insert({ event_type: "intake.submitted", related_entity_type: "intake_request", related_entity_id: requestId, template_key: "intake_submitted_admin_email", channel: "email", recipient_email: `${prefix}-${status}-notification@example.test`, status: "pending" } as never).select("id").single();
      fail(notification.error, `Unable to create ${status} notification fixture`);
      const denied = await Promise.all(nonSuperAdmins.map((client) => rpc(client, requestId)));
      if (denied.some((result) => !result.error)) throw new Error(`${status} request was deletable by a non-Super Admin`);
      const deleted = await rpc(superAdmin, requestId); fail(deleted.error, `Super Admin could not delete ${status} request`);
      const remaining = await service.from("intake_requests" as never).select("id").eq("id", requestId);
      fail(remaining.error, `Unable to check deleted ${status} request`); if ((remaining.data ?? []).length !== 0) throw new Error(`${status} request remains after deletion`);
      const people = await service.from("intake_request_people" as never).select("id").eq("intake_request_id", requestId); if ((people.data ?? []).length !== 0) throw new Error(`${status} people remain after deletion`);
      const history = await service.from("intake_request_status_history" as never).select("id").eq("intake_request_id", requestId); if ((history.data ?? []).length !== 0) throw new Error(`${status} history remains after deletion`);
      const deliveries = await service.from("notification_deliveries" as never).select("id").eq("related_entity_type", "intake_request").eq("related_entity_id", requestId); if ((deliveries.data ?? []).length !== 0) throw new Error(`${status} notification metadata remains after deletion`);
      const audit = await service.from("audit_events").select("event_type,details").eq("entity_type", "intake_request").eq("entity_id", requestId); fail(audit.error, `Unable to check ${status} delete audit`); if ((audit.data ?? []).length !== 1 || audit.data?.[0]?.event_type !== "intake.deleted" || JSON.stringify(audit.data[0].details) !== "{}") throw new Error(`${status} delete audit is not minimal`);
    }

    const linked = await createRequest("linked");
    const linkedGroup = await service.from("groups").insert({ campus_id: campus.data!.id, group_type: "couple", name: `${prefix} linked group` }).select("id").single();
    fail(linkedGroup.error, "Unable to create linked-group fixture"); const linkedGroupId = id((linkedGroup.data as unknown as Row)?.id); if (!linkedGroupId) throw new Error("Linked group id is missing"); groupIds.push(linkedGroupId);
    const linkedUpdate = await service.from("intake_requests" as never).update({ invited_group_id: linkedGroupId }).eq("id", linked); fail(linkedUpdate.error, "Unable to link group fixture");
    const linkedDenied = await rpc(superAdmin, linked); if (!linkedDenied.error) throw new Error("Linked request was deleted");
    const linkedStillThere = await service.from("intake_requests" as never).select("id").eq("id", linked); if ((linkedStillThere.data ?? []).length !== 1) throw new Error("Blocked linked request changed unexpectedly");
    await service.from("intake_requests" as never).update({ invited_group_id: null }).eq("id", linked);
    const linkedCleanup = await rpc(superAdmin, linked); fail(linkedCleanup.error, "Unable to clean linked fixture");

    const invited = await createRequest("invited");
    fail((await transition(invited, "start_review")).error, "Unable to start invited fixture review");
    const inviteResult = await superAdmin.rpc("invite_intake_request" as never, { target_request_id: invited } as never) as unknown as { data: { group_id?: string; invitation_ids?: string[] } | null; error: { message: string } | null };
    fail(inviteResult.error, "Unable to create invited fixture"); if (!inviteResult.data?.group_id || inviteResult.data.invitation_ids?.length !== 2) throw new Error("Invited fixture is incomplete"); groupIds.push(inviteResult.data.group_id); invitationIds.push(...inviteResult.data.invitation_ids);
    const invitedDenied = await rpc(superAdmin, invited); if (!invitedDenied.error) throw new Error("Invited request was deleted");
    const protectedGroup = await service.from("groups").select("id").eq("id", inviteResult.data.group_id); if ((protectedGroup.data ?? []).length !== 1) throw new Error("Protected Couple group changed unexpectedly");
    const protectedInvitations = await service.from("invitations").select("id").in("id", inviteResult.data.invitation_ids); if ((protectedInvitations.data ?? []).length !== 2) throw new Error("Protected invitations changed unexpectedly");
    console.log("DEV Intake safe-delete contract verified.");
  } finally {
    if (invitationIds.length) await service.from("audit_events").delete().in("entity_id", invitationIds);
    if (invitationIds.length) await service.from("invitations").delete().in("id", invitationIds);
    if (requestIds.length) await service.from("intake_requests" as never).update({ status: "ready_for_review", invited_group_id: null }).in("id", requestIds);
    if (groupIds.length) await service.from("groups").delete().in("id", groupIds);
    if (requestIds.length) await service.from("audit_events").delete().in("entity_id", requestIds);
    if (requestIds.length) await service.from("notification_deliveries" as never).delete().in("related_entity_id", requestIds);
    if (requestIds.length) await service.from("intake_request_status_history" as never).delete().in("intake_request_id", requestIds);
    if (requestIds.length) await service.from("intake_request_people" as never).delete().in("intake_request_id", requestIds);
    if (requestIds.length) await service.from("intake_requests" as never).delete().in("id", requestIds);
  }
}

await main();
