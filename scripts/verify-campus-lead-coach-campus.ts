import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-campus-lead-coach-campus-${Date.now()}`;
type Row = Record<string, unknown>;
type Result = { error: { message: string } | null };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function id(row: unknown, label: string) { const value = (row as Row | null)?.id; if (typeof value !== "string") throw new Error(`${label} id is missing`); return value; }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Campus Lead Coach campus verification refused outside approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") });
  fail(signIn.error, "Sign in DEV Admin");
  if (!signIn.data.session) throw new Error("DEV Admin session is missing");
  const administrator = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${signIn.data.session.access_token}` } } });
  const campusIds: string[] = [], groupIds: string[] = [], profileIds: string[] = [];
  try {
    for (const suffix of ["Hayward", "Fremont"]) {
      const result = await service.from("campuses").insert({ name: `${prefix} ${suffix}`, code: `${prefix}-${suffix}`.slice(0, 48), active: true }).select("id").single();
      fail(result.error, `Create ${suffix} campus`); campusIds.push(id(result.data, `${suffix} campus`));
    }
    const [hayward, fremont] = campusIds;
    for (const index of Array.from({ length: 6 }, (_, item) => item)) {
      const email = `${prefix}-${index}-${crypto.randomUUID()}@example.test`;
      const created = await service.auth.admin.createUser({ email, email_confirm: true });
      fail(created.error, `Create fixture user ${index}`); if (!created.data.user) throw new Error(`Fixture user ${index} is missing`);
      profileIds.push(created.data.user.id);
      fail((await service.from("profiles").upsert({ id: created.data.user.id, email, first_name: "Verify", last_name: `Member ${index}`, campus_id: index < 4 ? hayward : fremont, status: "active" }, { onConflict: "id" })).error, `Create fixture profile ${index}`);
    }
    fail((await service.from("profile_roles" as never).insert(profileIds.map((profileId, index) => ({ profile_id: profileId, role: index < 2 ? "campus_lead" : "coach", assigned_by: signIn.data.user!.id })) as never)).error, "Create operational team roles");
    for (const [campusId, type, name] of [[hayward, "campus_lead_team", "Hayward Campus Lead"], [hayward, "coach_team", "Hayward Coach"], [fremont, "coach_team", "Fremont Coach"]] as const) {
      const result = await service.from("groups").insert({ campus_id: campusId, group_type: type as "coach_team", name: `${prefix} ${name}` }).select("id").single();
      fail(result.error, `Create ${name}`); groupIds.push(id(result.data, name));
    }
    const [lead, haywardCoach, fremontCoach] = groupIds;
    fail((await service.from("group_members").insert([
      { group_id: lead, profile_id: profileIds[0] }, { group_id: lead, profile_id: profileIds[1] },
      { group_id: haywardCoach, profile_id: profileIds[2] }, { group_id: haywardCoach, profile_id: profileIds[3] },
      { group_id: fremontCoach, profile_id: profileIds[4] }, { group_id: fremontCoach, profile_id: profileIds[5] },
    ])).error, "Create operational team memberships");
    const rpc = administrator as unknown as { rpc(name: "assign_campus_lead_coach", args: { target_campus_lead_group_id: string; target_coach_group_id: string }): Promise<Result> };
    fail((await rpc.rpc("assign_campus_lead_coach", { target_campus_lead_group_id: lead, target_coach_group_id: haywardCoach })).error, "Same-campus Campus Lead Coach assignment");
    if (!(await rpc.rpc("assign_campus_lead_coach", { target_campus_lead_group_id: lead, target_coach_group_id: fremontCoach })).error) throw new Error("Cross-campus Campus Lead Coach assignment was accepted");
    console.log("DEV Campus Lead Coach same-campus assignment succeeded and cross-campus RPC was rejected.");
  } finally {
    if (groupIds.length) {
      const cleanup = await (service as unknown as { rpc(name: "cleanup_verifier_relationship_artifacts"): Promise<{ error: { message: string } | null }> }).rpc("cleanup_verifier_relationship_artifacts");
      fail(cleanup.error, "Remove verifier operational relationships");
    }
    if (profileIds.length) fail((await service.from("campus_lead_assignments" as never).delete().in("profile_id", profileIds)).error, "Remove verifier Campus Lead scopes");
    if (groupIds.length) fail((await service.from("group_members").delete().in("group_id", groupIds)).error, "Remove verifier memberships");
    if (groupIds.length) fail((await service.from("groups").delete().in("id", groupIds)).error, "Remove verifier groups");
    if (profileIds.length) fail((await service.from("profile_roles").delete().in("profile_id", profileIds)).error, "Remove verifier roles");
    if (profileIds.length) fail((await service.from("profiles").delete().in("id", profileIds)).error, "Remove verifier profiles");
    for (const profileId of profileIds) fail((await service.auth.admin.deleteUser(profileId)).error, "Remove verifier Auth identity");
    if (campusIds.length) fail((await service.from("campuses").delete().in("id", campusIds)).error, "Remove verifier campuses");
  }
}

await main();
