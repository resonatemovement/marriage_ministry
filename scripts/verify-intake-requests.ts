import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-intake-${Date.now()}`;
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Intake verification refused: configured project is not approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (email: string, password: string) => createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email, password });
  const admin = await signIn(required("TEST_ADMIN_EMAIL"), required("TEST_ADMIN_PASSWORD")); const coach = await signIn(required("TEST_COACH_EMAIL"), required("TEST_COACH_PASSWORD"));
  fail(admin.error, "Unable to sign in DEV Admin"); fail(coach.error, "Unable to sign in DEV Coach"); if (!admin.data.session || !coach.data.session) throw new Error("DEV verification sessions are missing");
  let requestId: string | null = null;
  try {
    const created = await service.from("intake_requests" as never).insert({ relationship_status: "married", campus_other: "Verification campus", currently_working_with_counselor: false, requested_support: ["lay_counselor"], goals: "Verify intake workflow", referral_source: "website" } as never).select("id").single();
    fail(created.error, "Unable to create deterministic Intake Request"); requestId = (created.data as unknown as { id: string }).id;
    const people = await service.from("intake_request_people" as never).insert([{ intake_request_id: requestId, person_position: "requester", first_name: "Request", last_name: prefix, email: `${prefix}-requester@example.test`, phone: "555-0101", city: "Test City", resonate_connections: ["Resonate Member"] }, { intake_request_id: requestId, person_position: "partner", first_name: "Partner", last_name: prefix, email: `${prefix}-partner@example.test`, phone: "555-0102", city: "Test City", resonate_connections: ["Attend church occasionally"] }] as never);
    fail(people.error, "Unable to create the two Intake Request people");
    const adminRead = await createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${admin.data.session.access_token}` } } }).from("intake_requests" as never).select("id").eq("id", requestId);
    if (adminRead.error || (adminRead.data as unknown[]).length !== 1) throw new Error("Admin cannot read Intake Requests");
    const coachRead = await createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${coach.data.session.access_token}` } } }).from("intake_requests" as never).select("id").eq("id", requestId);
    if (coachRead.error || (coachRead.data as unknown[]).length !== 0) throw new Error("Unauthorized Coach could read Intake Requests");
    const adminClient = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${admin.data.session.access_token}` } } });
    const valid = await adminClient.rpc("update_intake_request_status" as never, { target_request_id: requestId, next_status: "under_review" } as never); fail(valid.error, "Valid Intake Request transition failed");
    const invited = await adminClient.rpc("update_intake_request_status" as never, { target_request_id: requestId, next_status: "invited" } as never); if (!invited.error) throw new Error("Manual transition to Invited succeeded");
    const readyToInvite = await adminClient.rpc("update_intake_request_status" as never, { target_request_id: requestId, next_status: "ready_to_invite" } as never); fail(readyToInvite.error, "Valid Ready to Invite transition failed");
    const invalid = await adminClient.rpc("update_intake_request_status" as never, { target_request_id: requestId, next_status: "ready_for_review" } as never); if (!invalid.error) throw new Error("Invalid Intake Request transition succeeded");
    const history = await service.from("intake_request_status_history" as never).select("id").eq("intake_request_id", requestId); if (history.error || (history.data as unknown[]).length !== 3) throw new Error("Status history was not created");
    const audit = await service.from("audit_events").select("id").eq("entity_id", requestId).eq("event_type", "intake_request.status_updated"); if (audit.error || (audit.data ?? []).length !== 2) throw new Error("Intake Request audit event was not created");
    console.log("DEV Intake Request workflow verified.");
  } finally {
    if (requestId) { await service.from("audit_events").delete().eq("entity_id", requestId); await service.from("intake_request_status_history" as never).delete().eq("intake_request_id", requestId); await service.from("intake_request_people" as never).delete().eq("intake_request_id", requestId); await service.from("intake_requests" as never).delete().eq("id", requestId); }
  }
}
await main();
