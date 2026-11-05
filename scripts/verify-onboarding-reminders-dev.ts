/**
 * Controlled DEV integration check. Sends two generic reminders only to the
 * fixed public Mailinator test inboxes below, then deletes its synthetic DB graph.
 * The CRON secret is read from stdin and is never logged or stored.
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { stdin } from "node:process";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const DEV_URL = `https://${DEV_PROJECT_REF}.supabase.co`;
const DEV_APP_URL = "https://marriage-ministry-dev.vercel.app";
const recipients = [
  "resonate-onboarding-reminder-one@mailinator.com",
  "resonate-onboarding-reminder-two@mailinator.com",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function checkError(error: { message: string } | null, message: string) {
  if (error) throw new Error(message);
}

async function readCronSecret() {
  const input = createInterface({ input: stdin, crlfDelay: Infinity });
  const iterator = input[Symbol.asyncIterator]();
  const next = await iterator.next();
  input.close();
  const secret = next.value?.trim();
  assert(secret, "Provide the dedicated DEV CRON_SECRET on stdin.");
  return secret;
}

async function authEmailExists(client: ReturnType<typeof createClient<Database>>, email: string) {
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    checkError(error, "Could not verify the synthetic Mailinator Auth identities.");
    if (data.users.some((user) => user.email?.toLowerCase() === email)) return true;
    if (data.users.length < perPage) return false;
  }
}

async function runProtectedPost(secret: string) {
  const command = `vercel curl ${DEV_APP_URL}/api/cron/onboarding-reminders --yes -- --request POST --header "Authorization: Bearer $ONBOARDING_REMINDER_CRON_SECRET"`;
  return new Promise<{ ok: true; claimed: number; sent: number; failed: number; uncertain: number; skipped: number }>((resolve, reject) => {
    const child = spawn("sh", ["-c", command], { env: { ...process.env, ONBOARDING_REMINDER_CRON_SECRET: secret } });
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.resume();
    const timeout = setTimeout(() => child.kill("SIGTERM"), 120_000);
    child.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Protected DEV reminder request failed."));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error("Protected DEV reminder request failed."));
        return;
      }
      const response = [...stdout.matchAll(/\{[^{}]*"ok"\s*:\s*true[^{}]*\}/g)].at(-1)?.[0];
      if (!response) {
        reject(new Error("DEV reminder endpoint returned an unexpected response."));
        return;
      }
      resolve(JSON.parse(response) as { ok: true; claimed: number; sent: number; failed: number; uncertain: number; skipped: number });
    });
  });
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  assert(supabaseUrl === DEV_URL, "Refusing to run outside the dedicated DEV Supabase project.");
  assert(serviceKey, "Supabase server credential is unavailable.");
  const cronSecret = await readCronSecret();
  const client = createClient<Database>(DEV_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const fixtureId = randomUUID();
  const [firstEmail, secondEmail] = recipients;
  let groupId: string | null = null;
  let requestId: string | null = null;
  let failed = false;

  try {
    const { count: existingInvitations, error: invitationCheckError } = await client.from("invitations")
      .select("id", { count: "exact", head: true }).in("email", [...recipients]);
    checkError(invitationCheckError, "Could not verify the synthetic invitation addresses.");
    assert(existingInvitations === 0, "Synthetic Mailinator addresses already have invitation history; refusing to reuse them.");

    for (const email of recipients) {
      assert(!(await authEmailExists(client, email)), "Synthetic Mailinator address already belongs to an Auth account; refusing to reuse it.");
    }

    const { data: adminRole, error: adminRoleError } = await client.from("profile_roles")
      .select("profile_id").eq("role", "admin").limit(1).maybeSingle();
    checkError(adminRoleError, "Could not locate an authorized DEV invitation creator.");
    assert(adminRole?.profile_id, "No Admin profile is available for the synthetic invitation records.");
    const { data: adminProfile, error: adminProfileError } = await client.from("profiles")
      .select("id").eq("id", adminRole.profile_id).eq("status", "active").maybeSingle();
    checkError(adminProfileError, "Could not verify the DEV Admin profile.");
    assert(adminProfile, "The DEV invitation creator is not active.");

    const { data: campus, error: campusError } = await client.from("campuses")
      .select("id").eq("active", true).limit(1).maybeSingle();
    checkError(campusError, "Could not locate an active DEV campus.");
    assert(campus, "No active DEV campus is available for the temporary Intake Request.");

    const { data: group, error: groupError } = await client.from("groups").insert({
      campus_id: campus.id,
      group_type: "couple",
      name: `Temporary reminder verification ${fixtureId.slice(0, 8)}`,
    }).select("id").single();
    checkError(groupError, "Could not create the temporary Couple group.");
    assert(group, "Temporary Couple group was not created.");
    groupId = group.id;

    const { data: intake, error: intakeError } = await client.from("intake_requests").insert({
      status: "invited",
      relationship_status: "engaged",
      campus_id: campus.id,
      currently_working_with_counselor: false,
      requested_support: ["lay_counselor"],
      goals: "Temporary DEV reminder delivery verification.",
      referral_source: "website",
      invited_group_id: group.id,
    }).select("id").single();
    checkError(intakeError, "Could not create the temporary Intake Request.");
    assert(intake, "Temporary Intake Request was not created.");
    requestId = intake.id;

    const now = new Date().toISOString();
    const { error: peopleError } = await client.from("intake_request_people").insert([
      { intake_request_id: intake.id, person_position: "requester", first_name: "Test", last_name: "One", email: firstEmail, phone: "555-0101", city: "Test City" },
      { intake_request_id: intake.id, person_position: "partner", first_name: "Test", last_name: "Two", email: secondEmail, phone: "555-0102", city: "Test City" },
    ]);
    checkError(peopleError, "Could not create both temporary Intake Request people.");

    const { data: invitations, error: insertInvitationsError } = await client.from("invitations").insert([
      { email: firstEmail, first_name: "Test", last_name: "One", intended_role: "couple", campus_id: campus.id, group_id: group.id, invited_by: adminProfile.id, sent_at: now, last_sent_at: now },
      { email: secondEmail, first_name: "Test", last_name: "Two", intended_role: "couple", campus_id: campus.id, group_id: group.id, invited_by: adminProfile.id, sent_at: now, last_sent_at: now },
    ]).select("id");
    checkError(insertInvitationsError, "Could not create the temporary invitation records.");
    assert(invitations?.length === 2, "Expected exactly two temporary invitation records.");

    const { error: ageError } = await client.from("intake_request_status_history")
      .update({ changed_at: new Date(Date.now() - 169 * 60 * 60 * 1000).toISOString() })
      .eq("intake_request_id", intake.id).eq("to_status", "invited");
    checkError(ageError, "Could not set the temporary Invited status age.");

    const concurrentRuns = await Promise.all([runProtectedPost(cronSecret), runProtectedPost(cronSecret)]);
    assert(concurrentRuns.reduce((sum, response) => sum + response.claimed, 0) === 2
      && concurrentRuns.reduce((sum, response) => sum + response.sent, 0) === 2
      && concurrentRuns.every((response) => response.failed === 0 && response.uncertain === 0),
      "Concurrent deployed DEV runs did not accept exactly two controlled synthetic reminders.");

    const { data: deliveries, error: deliveriesError } = await client.from("onboarding_reminder_deliveries")
      .select("state,provider_message_id,sent_at").eq("intake_request_id", intake.id);
    checkError(deliveriesError, "Could not verify the temporary delivery audit rows.");
    assert(deliveries?.length === 2 && deliveries.every((row) => row.state === "sent" && row.provider_message_id && row.sent_at),
      "Provider acceptance was not recorded for both controlled reminders.");

    const repeatedRun = await runProtectedPost(cronSecret);
    assert(repeatedRun.claimed === 0 && repeatedRun.sent === 0,
      "A repeated job run attempted a duplicate reminder for the same invitation cycle.");
    console.log("Concurrent DEV runs accepted two synthetic Mailinator reminders total; repeat run produced zero sends.");
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const cleanupErrors: string[] = [];
    if (requestId) {
      const { error } = await client.from("onboarding_reminder_deliveries").delete().eq("intake_request_id", requestId);
      if (error) cleanupErrors.push("delivery audit rows");
      if (groupId) {
        const { error: invitationError } = await client.from("invitations").delete().eq("group_id", groupId);
        if (invitationError) cleanupErrors.push("synthetic invitations");
      }
      const { error: detachError } = await client.from("intake_requests").update({ invited_group_id: null }).eq("id", requestId);
      if (detachError) cleanupErrors.push("temporary Intake Request group link");
      const { error: historyError } = await client.from("intake_request_status_history").delete().eq("intake_request_id", requestId);
      if (historyError) cleanupErrors.push("synthetic status history");
      const { error: requestError } = await client.from("intake_requests").delete().eq("id", requestId);
      if (requestError) cleanupErrors.push("synthetic Intake Request");
    }
    if (groupId) {
      const { error } = await client.from("groups").delete().eq("id", groupId);
      if (error) cleanupErrors.push("temporary Couple group");
    }
    if (cleanupErrors.length) {
      console.error(`Synthetic DEV fixture cleanup incomplete: ${cleanupErrors.join(", ")}.`);
      process.exitCode = 1;
    } else if (requestId || groupId) {
      console.log(failed ? "Synthetic DEV fixtures were removed after a failed check." : "Synthetic DEV fixtures were removed.");
    }
  }
}

await main();
