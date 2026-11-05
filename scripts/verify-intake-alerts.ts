import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-intake-alerts-${Date.now()}`;
type Alert = { request_id: string; campus_id: string; request_status: string; alert_type: string; status_entered_at: string; threshold_hours: number; incomplete_partners: unknown };
type AuthClient = SupabaseClient<Database>;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function hoursAgo(hours: number) { return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(); }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Intake alert verification refused: configured project is not approved DEV.");

  const service = createClient<Database>(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (emailName: string, passwordName: string) => {
    const client = createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const result = await client.auth.signInWithPassword({ email: required(emailName), password: required(passwordName) });
    fail(result.error, `Unable to authenticate ${emailName.replace(/_EMAIL$/, "")}`);
    assert(result.data.session, "Authenticated DEV session was not returned.");
    return client;
  };
  const [admin, superAdmin, campusLead, couple] = await Promise.all([
    signIn("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"),
    signIn("TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD"),
    signIn("TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD"),
    signIn("TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD"),
  ]);
  const { data: adminUser, error: adminUserError } = await admin.auth.getUser();
  fail(adminUserError, "Unable to resolve the DEV Admin test identity");
  assert(adminUser.user, "DEV Admin identity is unavailable.");
  const adminProfileId = adminUser.user.id;
  const anonymous = createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: originalSettings, error: settingsError } = await admin
    .from("global_reminder_settings")
    .select("intake_ready_for_review_hours,intake_under_review_hours,intake_ready_to_invite_hours,intake_invited_onboarding_hours")
    .eq("id", "global")
    .single();
  fail(settingsError, "Admin could not read Intake alert settings");
  assert(originalSettings, "Global Intake alert settings are missing.");
  const original = {
    ready: originalSettings.intake_ready_for_review_hours,
    review: originalSettings.intake_under_review_hours,
    invite: originalSettings.intake_ready_to_invite_hours,
    onboarding: originalSettings.intake_invited_onboarding_hours,
  };

  const { data: leadAssignments, error: assignmentError } = await campusLead.from("campus_lead_assignments").select("campus_id").is("ended_at", null);
  fail(assignmentError, "Campus Lead could not read its own campus scope");
  const leadCampusIds = new Set((leadAssignments ?? []).map(({ campus_id }) => campus_id));
  assert(leadCampusIds.size > 0, "The DEV Campus Lead test identity has no active campus scope.");
  const { data: activeCampuses, error: campusError } = await admin.from("campuses").select("id").eq("active", true);
  fail(campusError, "Admin could not read active campuses");
  const outsideCampusId = (activeCampuses ?? []).find(({ id }) => !leadCampusIds.has(id))?.id;
  assert(outsideCampusId, "Cannot verify cross-campus denial: no active campus exists outside the test Campus Lead scope.");
  const targetCampusId = [...leadCampusIds][0];

  const requestIds: string[] = [];
  const groupIds: string[] = [];
  const invitationIds: string[] = [];
  let restoreSettingsNeeded = false;

  const createRequest = async (name: string, status: "ready_for_review" | "under_review" | "ready_to_invite" | "invited" | "closed", ageHours: number, inviteStates?: ("pending" | "accepted")[]) => {
    let groupId: string | undefined;
    if (status === "invited") {
      const { data, error } = await service.from("groups").insert({ campus_id: targetCampusId, group_type: "couple", name: `${prefix}-${name}` }).select("id").single();
      fail(error, `Unable to create temporary ${name} group`);
      assert(data, "Temporary Couple group was not created.");
      assert(typeof data.id === "string", "Temporary Couple group id was not returned.");
      groupId = data.id;
      groupIds.push(data.id);
    }

    const { data, error } = await service.from("intake_requests").insert({
      status,
      campus_id: targetCampusId,
      invited_group_id: groupId ?? null,
      relationship_status: "married",
      currently_working_with_counselor: false,
      requested_support: ["lay_counselor"],
      goals: `${prefix} validation fixture ${name}`,
      referral_source: "website",
    }).select("id").single();
    fail(error, `Unable to create temporary ${name} Intake Request`);
    assert(data, "Temporary Intake Request was not created.");
    const requestId = data.id;
    requestIds.push(requestId);
    const profileRows = inviteStates?.includes("accepted")
      ? (await service.from("profiles").select("id,email,onboarding_completed_at").not("onboarding_completed_at", "is", null).not("email", "is", null).limit(2))
      : null;
    if (profileRows?.error) fail(profileRows.error, "Unable to find completed DEV profiles for temporary invitation fixtures");
    const completedProfiles = profileRows?.data ?? [];
    assert(!inviteStates?.includes("accepted") || completedProfiles.length === 2, "Two completed DEV profiles are required for invitation validation fixtures.");
    const people = (inviteStates ?? ["pending", "pending"]).map((inviteStatus, index) => {
      const completedProfile = inviteStatus === "accepted" ? completedProfiles.shift() : undefined;
      const email = completedProfile?.email ?? `${prefix}-${name}-${index}@example.test`;
      return {
        person_position: index === 0 ? "requester" as const : "partner" as const,
        first_name: `${prefix} ${name} ${index + 1}`,
        last_name: "Fixture",
        email,
        phone: "555-0100",
        city: "Test City",
        resonate_connections: ["Attend church occasionally"],
        inviteStatus,
        profileId: completedProfile?.id ?? null,
      };
    });
    const peopleInsert = await service.from("intake_request_people").insert(people.map((person) => ({
      intake_request_id: requestId,
      person_position: person.person_position,
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      phone: person.phone,
      city: person.city,
      resonate_connections: person.resonate_connections,
    })));
    fail(peopleInsert.error, `Unable to create temporary ${name} Intake people`);

    if (groupId) {
      const invites = await service.from("invitations").insert(people.map((person) => ({
        email: person.email,
        first_name: person.first_name,
        last_name: person.last_name,
        intended_role: "couple" as const,
        campus_id: targetCampusId,
        group_id: groupId,
        invited_by: adminProfileId,
        status: person.inviteStatus,
        accepted_at: person.inviteStatus === "accepted" ? new Date().toISOString() : null,
        auth_user_id: person.profileId,
      }))).select("id");
      fail(invites.error, `Unable to create temporary ${name} Invitations`);
      invitationIds.push(...(invites.data ?? []).map(({ id }) => id));
    }

    const history = await service.from("intake_request_status_history").update({ changed_at: hoursAgo(ageHours) }).eq("intake_request_id", requestId).eq("to_status", status);
    fail(history.error, `Unable to set temporary ${name} status history`);
    return requestId;
  };

  const getAlerts = async (client: AuthClient, campusId?: string) => {
    const result = await client.rpc("get_intake_request_alerts", campusId ? { target_campus_id: campusId } : undefined);
    fail(result.error, "Intake alert read failed");
    return (result.data ?? []) as Alert[];
  };

  try {
    assert(original.ready === 48 && original.review === 72 && original.invite === 168 && original.onboarding === 168, "DEV Intake alert defaults differ from the approved values.");

    const changedReady = original.ready < 720 ? original.ready + 1 : original.ready - 1;
    const saved = await admin.rpc("update_global_intake_alert_settings", {
      next_ready_for_review_hours: changedReady,
      next_under_review_hours: original.review,
      next_ready_to_invite_hours: original.invite,
      next_invited_onboarding_hours: original.onboarding,
    });
    fail(saved.error, "Admin settings write was denied");
    restoreSettingsNeeded = true;
    assert(saved.data?.[0]?.ready_for_review_hours === changedReady, "Admin settings write did not persist.");
    const invalidSettingsWrite = await admin.rpc("update_global_intake_alert_settings", {
      next_ready_for_review_hours: 0,
      next_under_review_hours: 721,
      next_ready_to_invite_hours: original.invite,
      next_invited_onboarding_hours: original.onboarding,
    });
    assert(invalidSettingsWrite.error, "Database settings RPC accepted out-of-range threshold values.");
    const unchangedAfterInvalidWrite = await admin.from("global_reminder_settings")
      .select("intake_ready_for_review_hours,intake_under_review_hours")
      .eq("id", "global")
      .single();
    fail(unchangedAfterInvalidWrite.error, "Unable to verify settings after rejected invalid write");
    assert(unchangedAfterInvalidWrite.data?.intake_ready_for_review_hours === changedReady
      && unchangedAfterInvalidWrite.data?.intake_under_review_hours === original.review,
    "Rejected invalid settings write changed stored thresholds.");

    const leadRead = await campusLead.from("global_reminder_settings").select("id").eq("id", "global").maybeSingle();
    fail(leadRead.error, "Campus Lead settings table read check failed");
    assert(!leadRead.data, "Campus Lead unexpectedly gained direct Admin Settings table access.");
    const leadWrite = await campusLead.rpc("update_global_intake_alert_settings", {
      next_ready_for_review_hours: changedReady,
      next_under_review_hours: original.review,
      next_ready_to_invite_hours: original.invite,
      next_invited_onboarding_hours: original.onboarding,
    });
    assert(leadWrite.error, "Campus Lead was able to modify global Intake alert settings.");

    const adminRestore = await admin.rpc("update_global_intake_alert_settings", {
      next_ready_for_review_hours: original.ready,
      next_under_review_hours: original.review,
      next_ready_to_invite_hours: original.invite,
      next_invited_onboarding_hours: original.onboarding,
    });
    fail(adminRestore.error, "Admin could not restore original Intake alert settings");
    restoreSettingsNeeded = false;
    const superWrite = await superAdmin.rpc("update_global_intake_alert_settings", {
      next_ready_for_review_hours: original.ready,
      next_under_review_hours: original.review,
      next_ready_to_invite_hours: original.invite,
      next_invited_onboarding_hours: original.onboarding,
    });
    fail(superWrite.error, "Super Admin settings write was denied");

    const anonymousAlerts = await anonymous.rpc("get_intake_request_alerts", {});
    assert(anonymousAlerts.error, "Unauthenticated alert read was not denied.");
    const coupleAlerts = await couple.rpc("get_intake_request_alerts", {});
    assert(coupleAlerts.error, "Couple alert read was not denied.");

    const readyNew = await createRequest("ready-new", "ready_for_review", original.ready / 2);
    const readyStalled = await createRequest("ready-stalled", "ready_for_review", original.ready + 0.02);
    const underFresh = await createRequest("under-fresh", "under_review", original.review - 0.5);
    const underStalled = await createRequest("under-stalled", "under_review", original.review + 0.02);
    const inviteFresh = await createRequest("invite-fresh", "ready_to_invite", original.invite - 0.5);
    const inviteStalled = await createRequest("invite-stalled", "ready_to_invite", original.invite + 0.02);
    const invitedBothIncomplete = await createRequest("invited-two-incomplete", "invited", original.onboarding + 0.02, ["pending", "pending"]);
    const invitedOneIncomplete = await createRequest("invited-one-incomplete", "invited", original.onboarding + 0.02, ["pending", "accepted"]);
    const invitedComplete = await createRequest("invited-complete", "invited", original.onboarding + 0.02, ["accepted", "accepted"]);
    const closed = await createRequest("closed", "closed", original.review + 10);
    const missingHistory = await createRequest("missing-history", "ready_for_review", original.ready + 10);
    const missingHistoryDelete = await service.from("intake_request_status_history").delete().eq("intake_request_id", missingHistory);
    fail(missingHistoryDelete.error, "Unable to create missing-history validation fixture");

    const adminAlerts = await getAlerts(admin);
    const adminIds = adminAlerts.map((alert) => alert.request_id);
    const alertCounts = (requestId: string) => adminAlerts.filter((alert) => alert.request_id === requestId).length;
    assert(alertCounts(readyNew) === 1 && adminAlerts.some((alert) => alert.request_id === readyNew && alert.alert_type === "new_ready_for_review"), "New Ready for Review request did not appear immediately.");
    assert(adminAlerts.some((alert) => alert.request_id === readyStalled && alert.alert_type === "stalled_ready_for_review"), "Ready for Review threshold did not mark the request stalled.");
    assert(!adminIds.includes(underFresh) && adminAlerts.some((alert) => alert.request_id === underStalled && alert.alert_type === "stalled_under_review"), "Under Review elapsed threshold behavior is incorrect.");
    assert(!adminIds.includes(inviteFresh) && adminAlerts.some((alert) => alert.request_id === inviteStalled && alert.alert_type === "stalled_ready_to_invite"), "Ready to Invite elapsed threshold behavior is incorrect.");
    const bothIncompleteAlert = adminAlerts.find((alert) => alert.request_id === invitedBothIncomplete);
    const oneIncompleteAlert = adminAlerts.find((alert) => alert.request_id === invitedOneIncomplete);
    assert(bothIncompleteAlert && Array.isArray(bothIncompleteAlert.incomplete_partners) && bothIncompleteAlert.incomplete_partners.length === 2, "Both incomplete partners were not identified.");
    assert(oneIncompleteAlert && Array.isArray(oneIncompleteAlert.incomplete_partners) && oneIncompleteAlert.incomplete_partners.length === 1, "The single incomplete partner was not identified.");
    assert(!adminIds.includes(invitedComplete) && !adminIds.includes(closed) && !adminIds.includes(missingHistory), "Completed, closed, or missing-history requests were incorrectly alerted.");
    assert(adminAlerts.every((alert) => alertCounts(alert.request_id) === 1), "Duplicate alert rows were returned for an Intake Request.");

    const resendTarget = await service.from("invitations").select("id").eq("group_id", groupIds[1]).eq("status", "pending").limit(1).single();
    fail(resendTarget.error, "Unable to find temporary pending invitation for resend-clock check");
    assert(resendTarget.data, "Temporary pending invitation was not returned.");
    const clockBefore = oneIncompleteAlert?.status_entered_at;
    const resendMetadata = await service.from("invitations").update({ last_sent_at: new Date().toISOString() }).eq("id", resendTarget.data.id);
    fail(resendMetadata.error, "Unable to simulate resend metadata on temporary invitation");
    const afterResend = await getAlerts(admin);
    assert(afterResend.find((alert) => alert.request_id === invitedOneIncomplete)?.status_entered_at === clockBefore, "Invitation resend metadata reset the original status-entry clock.");
    assert((await getAlerts(admin)).length === afterResend.length, "Repeated alert reads created duplicate/persistent alert records.");

    const adminScope = await getAlerts(admin);
    const superScope = await getAlerts(superAdmin);
    assert(adminScope.map((item) => `${item.request_id}:${item.alert_type}`).sort().join("|") === superScope.map((item) => `${item.request_id}:${item.alert_type}`).sort().join("|"), "Admin and Super Admin global alert scopes differ.");
    const leadScope = await getAlerts(campusLead);
    assert(leadScope.every((alert) => leadCampusIds.has(alert.campus_id)), "Campus Lead received an alert outside its assigned campuses.");
    const crossCampus = await campusLead.rpc("get_intake_request_alerts", { target_campus_id: outsideCampusId });
    assert(crossCampus.error, "Campus Lead was able to query alerts for an unrelated campus.");

    console.log(JSON.stringify({
      result: "DEV authenticated Intake alert verification passed",
      roles: { adminGlobal: true, superAdminGlobal: true, campusLeadScoped: true, campusLeadSettingsWriteDenied: true, campusLeadAdminSettingsTableHidden: true, coupleDenied: true, anonymousDenied: true, crossCampusDenied: true },
      thresholds: { defaultsVerified: true, adminPersistenceAndRestoreVerified: true, invalidDatabaseWriteRejected: true, superAdminWriteVerified: true },
      rules: { readyImmediateAndStalled: true, underReviewElapsedBoundary: true, readyToInviteElapsedBoundary: true, oneOrBothIncomplete: true, completedOnboardingExcluded: true, resendClockPreserved: true, closedExcluded: true, missingHistoryFailClosed: true, noDuplicateRows: true },
      temporaryRequests: requestIds.length,
      temporaryGroups: groupIds.length,
      temporaryInvitations: invitationIds.length,
    }));
  } finally {
    if (restoreSettingsNeeded) {
      const restore = await admin.rpc("update_global_intake_alert_settings", {
        next_ready_for_review_hours: original.ready,
        next_under_review_hours: original.review,
        next_ready_to_invite_hours: original.invite,
        next_invited_onboarding_hours: original.onboarding,
      });
      fail(restore.error, "Unable to restore original DEV Intake alert thresholds");
    }
    if (groupIds.length) fail((await service.from("invitations").delete().in("group_id", groupIds)).error, "Unable to remove temporary verification invitations");
    if (requestIds.length) fail((await service.from("intake_request_status_history").delete().in("intake_request_id", requestIds)).error, "Unable to remove temporary verification status history");
    if (requestIds.length) fail((await service.from("intake_requests").delete().in("id", requestIds)).error, "Unable to remove temporary verification Intake Requests");
    if (groupIds.length) fail((await service.from("groups").delete().in("id", groupIds)).error, "Unable to remove temporary verification Couple groups");
  }
}

await main();
