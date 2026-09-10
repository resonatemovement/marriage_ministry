import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-intake-notifications-${Date.now()}`;
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; };
const fail = (error: { message: string } | null, action: string) => { if (error) throw new Error(`${action}: ${error.message}`); };

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Notification verification refused: configured project is not approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = async (email: string, password: string) => createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email, password });
  const [adminSession, coachSession] = await Promise.all([signIn(required("TEST_ADMIN_EMAIL"), required("TEST_ADMIN_PASSWORD")), signIn(required("TEST_COACH_EMAIL"), required("TEST_COACH_PASSWORD"))]);
  fail(adminSession.error, "Unable to sign in DEV Admin"); fail(coachSession.error, "Unable to sign in DEV Coach");
  if (!adminSession.data.session || !coachSession.data.session) throw new Error("DEV verification sessions are missing");
  const recipient = `${prefix}@example.test`;
  try {
    const created = await service.from("notification_deliveries" as never).insert({ event_type: "intake.submitted", related_entity_type: "intake_request", related_entity_id: crypto.randomUUID(), template_key: "intake_submitted_couple_email", channel: "email", recipient_email: recipient, status: "pending" } as never).select("id,status").single();
    fail(created.error, "Unable to create notification delivery fixture");
    const fixture = created.data as unknown as { id: string; status: string };
    if (!fixture.id || fixture.status !== "pending") throw new Error("Notification delivery fixture is invalid");
    const updated = await service.from("notification_deliveries" as never).update({ status: "failed", error_category: "provider_unavailable", error_message: "Deterministic verifier", failed_at: new Date().toISOString() } as never).eq("id", fixture.id).select("status,error_category,failed_at").single();
    fail(updated.error, "Unable to record notification failure");
    const result = updated.data as unknown as { status: string; error_category: string; failed_at: string | null };
    if (result.status !== "failed" || result.error_category !== "provider_unavailable" || !result.failed_at) throw new Error("Notification failure metadata was not recorded");
    const admin = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${adminSession.data.session.access_token}` } } });
    const coach = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${coachSession.data.session.access_token}` } } });
    const [adminRead, coachRead] = await Promise.all([admin.from("notification_deliveries" as never).select("id").eq("id", fixture.id), coach.from("notification_deliveries" as never).select("id").eq("id", fixture.id)]);
    if (adminRead.error || (adminRead.data as unknown[]).length !== 1) throw new Error("Admin cannot read notification delivery records");
    if (coachRead.error || (coachRead.data as unknown[]).length !== 0) throw new Error("Unauthorized Coach could read notification delivery records");
    console.log("DEV notification delivery persistence and Admin-only RLS verified without sending email.");
  } finally {
    await service.from("notification_deliveries" as never).delete().eq("recipient_email", recipient);
  }
}

await main();
