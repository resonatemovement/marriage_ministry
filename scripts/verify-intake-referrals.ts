import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
type Client = SupabaseClient<Database>;
type Fixture = { id: string; campusId: string; suffix: string };
const prefix = `verify-referral-${Date.now()}`;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
async function signIn(emailKey: string, passwordKey: string, url: string, key: string): Promise<Client> {
  const client = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: required(emailKey), password: required(passwordKey) });
  fail(error, `Unable to authenticate ${emailKey.replace("_EMAIL", "")}`);
  assert(data.session, "Authenticated DEV session was not returned.");
  return client;
}
function rpc(client: Client, name: string, args: Record<string, unknown>) {
  const caller = client as unknown as { rpc: (rpcName: string, rpcArgs: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
  return caller.rpc(name, args);
}
async function action(client: Client, requestId: string, actionName: string, reason: string | null = null) {
  return rpc(client, "take_intake_request_action", {
    target_request_id: requestId,
    target_action: actionName,
    target_reason_code: null,
    target_reason_detail: reason,
  });
}
async function createFixture(service: Client, campusId: string, index: number): Promise<Fixture> {
  const suffix = `${prefix}-${index}`;
  const created = await service.from("intake_requests").insert({
    campus_id: campusId,
    relationship_status: "married",
    currently_working_with_counselor: false,
    requested_support: ["lay_counselor"],
    goals: "Verify Intake referral lifecycle",
    referral_source: "website",
  }).select("id").single();
  fail(created.error, "Unable to create temporary Intake Request");
  assert(created.data, "Temporary Intake Request was not returned.");
  const people = await service.from("intake_request_people").insert([
    { intake_request_id: created.data.id, person_position: "requester", first_name: "Verify", last_name: `${suffix} A`, email: `${suffix}-a@example.test`, phone: "555-0101", city: "Test City", resonate_connections: ["member"] },
    { intake_request_id: created.data.id, person_position: "partner", first_name: "Verify", last_name: `${suffix} B`, email: `${suffix}-b@example.test`, phone: "555-0102", city: "Test City", resonate_connections: ["member"] },
  ]);
  fail(people.error, "Unable to create temporary Intake Request people");
  return { id: created.data.id, campusId, suffix };
}
async function removeFixture(service: Client, fixture: Fixture) {
  fail((await service.from("audit_events").delete().eq("entity_id", fixture.id)).error, "Unable to remove temporary referral audit records");
  fail((await service.from("intake_request_status_history").delete().eq("intake_request_id", fixture.id)).error, "Unable to remove temporary referral history");
  fail((await service.from("intake_requests").delete().eq("id", fixture.id)).error, "Unable to remove temporary referral request");
}
async function removeInterruptedFixtures(service: Client) {
  const people = await service.from("intake_request_people").select("intake_request_id").ilike("email", "verify-referral-%-a@example.test");
  fail(people.error, "Unable to inspect prior referral verifier artifacts");
  const ids = [...new Set((people.data ?? []).map(({ intake_request_id }) => intake_request_id))];
  for (const id of ids) await removeFixture(service, { id, campusId: "", suffix: "" });
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Intake referral verification refused: configured project is not approved DEV.");
  const service = createClient<Database>(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  await removeInterruptedFixtures(service);
  const [admin, superAdmin, campusLead, coach, counselor, couple] = await Promise.all([
    signIn("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD", url, publishableKey),
    signIn("TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD", url, publishableKey),
    signIn("TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD", url, publishableKey),
    signIn("TEST_COACH_EMAIL", "TEST_COACH_PASSWORD", url, publishableKey),
    signIn("TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD", url, publishableKey),
    signIn("TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD", url, publishableKey),
  ]);
  const anonymous = createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: assignments, error: assignmentsError } = await service.from("campus_lead_assignments").select("campus_id,campuses!inner(active)").eq("profile_id", (await campusLead.auth.getUser()).data.user?.id ?? "").is("ended_at", null);
  fail(assignmentsError, "Unable to inspect existing Campus Lead scope");
  const scopedCampusIds = [...new Set((assignments ?? []).filter((row) => row.campuses?.active).map(({ campus_id }) => campus_id))];
  assert(scopedCampusIds.length > 0, "Test Campus Lead has no active assigned campus.");
  const { data: activeCampuses, error: campusesError } = await service.from("campuses").select("id").eq("active", true);
  fail(campusesError, "Unable to inspect active DEV campuses");
  const outsideCampusId = (activeCampuses ?? []).find(({ id }) => !scopedCampusIds.includes(id))?.id;
  assert(outsideCampusId, "Cannot verify cross-campus denial: DEV has no active campus outside the test Campus Lead's scope.");

  const fixtures: Fixture[] = [];
  try {
    const adminFixture = await createFixture(service, scopedCampusIds[0], 1); fixtures.push(adminFixture);
    const superAdminFixture = await createFixture(service, scopedCampusIds[0], 2); fixtures.push(superAdminFixture);
    const leadFixture = await createFixture(service, scopedCampusIds[0], 3); fixtures.push(leadFixture);
    const outsideFixture = await createFixture(service, outsideCampusId, 4); fixtures.push(outsideFixture);
    const outsideAdminFixture = await createFixture(service, outsideCampusId, 5); fixtures.push(outsideAdminFixture);

    const adminReferral = await action(admin, adminFixture.id, "refer_elsewhere", "  Referred to another provider.  ");
    fail(adminReferral.error, "Admin referral failed");
    const superAdminReferral = await action(superAdmin, superAdminFixture.id, "refer_elsewhere", "Referred after review.");
    fail(superAdminReferral.error, "Super Admin referral failed");
    const adminStatus = await service.from("intake_requests").select("status").eq("id", adminFixture.id).single();
    fail(adminStatus.error, "Unable to verify Admin referral status");
    assert(adminStatus.data && String(adminStatus.data.status) === "referred_elsewhere", "Admin referral status was not persisted.");

    const leadStart = await action(campusLead, leadFixture.id, "start_review");
    fail(leadStart.error, "Campus Lead review transition failed");
    const tooShort = await action(campusLead, leadFixture.id, "refer_elsewhere", "short");
    assert(tooShort.error, "Database accepted a referral reason shorter than 10 characters.");
    const tooLong = await action(campusLead, leadFixture.id, "refer_elsewhere", "x".repeat(501));
    assert(tooLong.error, "Database accepted a referral reason longer than 500 characters.");
    const leadReferral = await action(campusLead, leadFixture.id, "refer_elsewhere", "  Referred to another care provider.  ");
    fail(leadReferral.error, "In-scope Campus Lead referral failed");

    const crossCampus = await action(campusLead, outsideFixture.id, "refer_elsewhere", "This should be denied.");
    assert(crossCampus.error, "Campus Lead referred an Intake Request outside assigned campus scope.");
    const globalAdminReferral = await action(admin, outsideAdminFixture.id, "refer_elsewhere", "Admin global scope verified.");
    fail(globalAdminReferral.error, "Admin could not refer an Intake Request outside the Campus Lead's assigned campus");
    for (const [client, label] of [[coach, "Coach"], [counselor, "Counselor"], [couple, "Couple"], [anonymous, "Anonymous"]] as const) {
      const denied = await action(client, leadFixture.id, "refer_elsewhere", "Unauthorized referral attempt.");
      assert(denied.error, `${label} unexpectedly referred an Intake Request.`);
    }

    const inviteWhileReferred = await rpc(admin, "invite_intake_request", { target_request_id: leadFixture.id });
    assert(inviteWhileReferred.error, "A referred Intake Request was inviteable without reopening.");
    const directStatusChange = await rpc(admin, "update_intake_request_status", { target_request_id: leadFixture.id, next_status: "under_review" });
    assert(directStatusChange.error, "Legacy status RPC bypassed the explicit reopen action for a referred request.");

    const historyBefore = await service.from("intake_request_status_history").select("id,to_status,changed_by,changed_at,note").eq("intake_request_id", leadFixture.id).order("changed_at", { ascending: true });
    fail(historyBefore.error, "Unable to verify referral history");
    const referralHistory = (historyBefore.data ?? []).find(({ to_status }) => String(to_status) === "referred_elsewhere");
    assert(referralHistory?.changed_by && referralHistory.note === "Referred to another care provider.", "Referral reason, actor, or history timestamp was not recorded correctly.");
    const audit = await service.from("audit_events").select("actor_id,event_type,details").eq("entity_id", leadFixture.id).eq("event_type", "intake_request.refer_elsewhere").single();
    fail(audit.error, "Unable to verify referral audit event");
    assert(audit.data && audit.data.actor_id === referralHistory.changed_by && (audit.data.details as { referral_reason?: string }).referral_reason === referralHistory.note, "Referral audit event did not preserve the actor and reason.");

    const alerts = await rpc(admin, "get_intake_request_alerts", {});
    fail(alerts.error, "Unable to verify referred-request alert exclusion");
    assert(!Array.isArray(alerts.data) || !alerts.data.some((row) => (row as { request_id?: string }).request_id === leadFixture.id), "Referred Intake Request appeared in the alert detector.");

    const dashboardCount = async (client: Client) => rpc(client, "get_dashboard_intake_referral_count", {});
    const [adminCount, superAdminCount, leadCount] = await Promise.all([dashboardCount(admin), dashboardCount(superAdmin), dashboardCount(campusLead)]);
    fail(adminCount.error, "Admin Dashboard Intake referral count failed"); fail(superAdminCount.error, "Super Admin Dashboard Intake referral count failed"); fail(leadCount.error, "Campus Lead Dashboard Intake referral count failed");
    assert(adminCount.data === superAdminCount.data, "Admin and Super Admin Intake referral totals differ.");
    assert(typeof leadCount.data === "number" && leadCount.data <= (adminCount.data as number), "Campus Lead Intake referral total is outside global totals.");
    const referralSource = await service.from("intake_requests").select("status,campus_id");
    fail(referralSource.error, "Unable to independently verify referral counts");
    const sourceRows = referralSource.data ?? [];
    assert(adminCount.data === sourceRows.filter((row) => String(row.status) === "referred_elsewhere").length, "Admin Dashboard referral count differs from all DEV Intake Request records.");
    assert(leadCount.data === sourceRows.filter((row) => String(row.status) === "referred_elsewhere" && scopedCampusIds.includes(row.campus_id ?? "")).length, "Campus Lead Dashboard referral count differs from assigned-campus DEV records.");
    for (const [client, label] of [[coach, "Coach"], [counselor, "Counselor"], [couple, "Couple"], [anonymous, "Anonymous"]] as const) {
      const denied = await dashboardCount(client);
      assert(denied.error, `${label} unexpectedly read Dashboard Intake referral counts.`);
    }

    const reopened = await action(campusLead, leadFixture.id, "reopen");
    fail(reopened.error, "Campus Lead reopen failed");
    const finalState = await service.from("intake_requests").select("status").eq("id", leadFixture.id).single();
    fail(finalState.error, "Unable to verify reopened Intake status");
    assert(finalState.data && finalState.data.status === "under_review", "Reopening did not return referred request to Under Review.");
    const preservedHistory = await service.from("intake_request_status_history").select("id,to_status").eq("intake_request_id", leadFixture.id);
    fail(preservedHistory.error, "Unable to verify preserved referral history");
    assert((preservedHistory.data ?? []).filter(({ to_status }) => String(to_status) === "referred_elsewhere").length === 1, "Reopening removed the prior referral history.");

    console.log("Verified DEV Intake referrals: Admin, Super Admin, and in-scope Campus Lead allowed; cross-campus and other roles denied; referral reason/audit, alert exclusion, invite block, and reopen history passed.");
  } finally {
    for (const fixture of fixtures.reverse()) await removeFixture(service, fixture);
    const remaining = await service.from("intake_request_people").select("id", { count: "exact", head: true }).ilike("email", "verify-referral-%-a@example.test");
    fail(remaining.error, "Unable to verify referral verifier cleanup");
    assert(remaining.count === 0, "Temporary referral verifier records remain in DEV.");
  }
}

await main();
