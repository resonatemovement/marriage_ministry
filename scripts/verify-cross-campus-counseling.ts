import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-cross-campus-counseling-${Date.now()}`;
type Row = Record<string, unknown>;
type Result = { data: string | null; error: { message: string } | null };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function id(row: unknown, label: string) { const value = (row as Row | null)?.id; if (typeof value !== "string") throw new Error(`${label} id is missing`); return value; }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Cross-campus counseling verification refused outside approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") });
  fail(signedIn.error, "Sign in DEV Admin"); if (!signedIn.data.session) throw new Error("DEV Admin session is missing");
  const admin = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } } });
  const campuses: string[] = [], groups: string[] = [], profiles: string[] = [];
  try {
    for (const suffix of ["Hayward", "Fremont"]) {
      const result = await service.from("campuses").insert({ name: `${prefix} ${suffix}`, code: `${prefix}-${suffix}`.slice(0, 48), active: true }).select("id").single();
      fail(result.error, `Create ${suffix} campus`); campuses.push(id(result.data, `${suffix} campus`));
    }
    const [hayward, fremont] = campuses;
    const roles = ["couple", "couple", "counselor", "counselor", "coach", "coach", "campus_lead", "campus_lead"] as const;
    for (const [index, role] of roles.entries()) {
      const email = `${prefix}-${index}-${crypto.randomUUID()}@example.test`;
      const created = await service.auth.admin.createUser({ email, email_confirm: true });
      fail(created.error, `Create fixture user ${index}`); if (!created.data.user) throw new Error(`Fixture user ${index} is missing`);
      profiles.push(created.data.user.id);
      fail((await service.from("profiles").upsert({ id: created.data.user.id, email, first_name: "Verify", last_name: `Member ${index}`, campus_id: index < 2 ? hayward : fremont, status: "active", onboarding_completed_at: "2026-01-01T00:00:00.000Z", phone: "+15555550100", photo_path: `profiles/${created.data.user.id}/avatar.avif` }, { onConflict: "id" })).error, `Create fixture profile ${index}`);
      fail((await service.from("profile_roles" as never).insert({ profile_id: created.data.user.id, role, assigned_by: signedIn.data.user!.id } as never)).error, `Create fixture ${role} role ${index}`);
    }
    for (const [campusId, type, name] of [[hayward, "couple", "Hayward Couple"], [fremont, "counselor_team", "Fremont Counselor"], [fremont, "coach_team", "Fremont Coach"], [fremont, "campus_lead_team", "Fremont Campus Lead"]] as const) {
      const result = await service.from("groups").insert({ campus_id: campusId, group_type: type as "couple", name: `${prefix} ${name}` }).select("id").single();
      fail(result.error, `Create ${name}`); groups.push(id(result.data, name));
    }
    const [couple, counselor, coach, campusLead] = groups;
    fail((await service.from("group_members").insert([
      { group_id: couple, profile_id: profiles[0] }, { group_id: couple, profile_id: profiles[1] },
      { group_id: counselor, profile_id: profiles[2] }, { group_id: counselor, profile_id: profiles[3] },
      { group_id: coach, profile_id: profiles[4] }, { group_id: coach, profile_id: profiles[5] },
      { group_id: campusLead, profile_id: profiles[6] }, { group_id: campusLead, profile_id: profiles[7] },
    ])).error, "Create fixture team memberships");
    const rpc = admin as unknown as { rpc(name: "ensure_and_assign_counseling_case", args: { target_couple_group_id: string; target_group_id: string; target_profile_id: null; target_assignment_type: "counselor" }): Promise<Result> };
    for (const [target, label] of [[counselor, "Counselor"], [coach, "Coach"], [campusLead, "Campus Lead"]] as const) fail((await rpc.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: couple, target_group_id: target, target_profile_id: null, target_assignment_type: "counselor" })).error, `Cross-campus ${label} Counselor-of-record assignment`);
    const caseResult = await service.from("counseling_cases").select("id,case_assignments(id,assigned_group_id,assignment_type,ended_at)").eq("couple_group_id", couple).single();
    fail(caseResult.error, "Read fixture counseling case");
    if (!caseResult.data) throw new Error("Fixture counseling case is missing");
    const assignments = (caseResult.data.case_assignments ?? []) as Array<{ assigned_group_id: string; assignment_type: string; ended_at: string | null }>;
    const active = assignments.filter((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null);
    if (active.length !== 1 || active[0]?.assigned_group_id !== campusLead || assignments.filter((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at !== null).length !== 2) throw new Error("Counselor-of-record reassignment did not preserve exactly one active assignment and two ended history rows");
    console.log("DEV cross-campus Counselor, Coach, and Campus Lead Counselor-of-record assignments succeeded with one active assignment preserved.");
  } finally {
    if (groups.length) {
      const cleanup = await (service as unknown as { rpc(name: "cleanup_verifier_relationship_artifacts"): Promise<{ error: { message: string } | null }> }).rpc("cleanup_verifier_relationship_artifacts");
      fail(cleanup.error, "Remove verifier counseling history");
      fail((await service.from("group_members").delete().in("group_id", groups)).error, "Remove verifier memberships");
      fail((await service.from("groups").delete().in("id", groups)).error, "Remove verifier groups");
    }
    if (profiles.length) {
      fail((await service.from("campus_lead_assignments" as never).delete().in("profile_id", profiles)).error, "Remove verifier Campus Lead scopes");
      fail((await service.from("profile_roles").delete().in("profile_id", profiles)).error, "Remove verifier roles");
      fail((await service.from("profiles").delete().in("id", profiles)).error, "Remove verifier profiles");
    }
    for (const profile of profiles) fail((await service.auth.admin.deleteUser(profile)).error, "Remove verifier Auth identity");
    if (campuses.length) fail((await service.from("campuses").delete().in("id", campuses)).error, "Remove verifier campuses");
  }
}

await main();
