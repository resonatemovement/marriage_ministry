import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import { cleanupCampusLeadCounselorVerifierArtifacts } from "./campus-lead-counselor-verifier-cleanup.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-campus-lead-counselor-${Date.now()}`;
type Result = { error: { message: string } | null };
type IdRow = { id: string };

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function id(row: unknown, label: string) { const value = (row as IdRow | null)?.id; if (!value) throw new Error(`${label} id is missing`); return value; }

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Campus Lead Counselor verification refused outside approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  console.log("Removed stale Campus Lead Counselor verifier artifacts:", await cleanupCampusLeadCounselorVerifierArtifacts(service));
  const signIn = await createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email: required("TEST_ADMIN_EMAIL").toLowerCase(), password: required("TEST_ADMIN_PASSWORD") });
  fail(signIn.error, "Sign in DEV Admin"); if (!signIn.data.session || !signIn.data.user) throw new Error("DEV Admin session is missing");
  const admin = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${signIn.data.session.access_token}` } } });
  const campuses: string[] = [], groups: string[] = [], profiles: string[] = [];
  let primaryFailure: unknown;
  try {
    for (const suffix of ["Hayward", "Fremont"]) { const result = await service.from("campuses").insert({ name: `${prefix} ${suffix}`, code: `${prefix}-${suffix}`.slice(0, 48), active: true }).select("id").single(); fail(result.error, `Create ${suffix} campus`); campuses.push(id(result.data, suffix)); }
    const [hayward, fremont] = campuses;
    for (const index of Array.from({ length: 10 }, (_, value) => value)) {
      const email = `${prefix}-${index}-${crypto.randomUUID()}@example.test`;
      const created = await service.auth.admin.createUser({ email, email_confirm: true }); fail(created.error, `Create user ${index}`); if (!created.data.user) throw new Error(`User ${index} missing`); profiles.push(created.data.user.id);
      fail((await service.from("profiles").upsert({ id: created.data.user.id, email, first_name: "Verify", last_name: `Member ${index}`, campus_id: index < 8 ? hayward : fremont, phone: `510555${String(index).padStart(4, "0")}`, photo_path: `verify/${index}.avif`, status: "active", onboarding_completed_at: new Date().toISOString() }, { onConflict: "id" })).error, `Create profile ${index}`);
    }
    const roles = profiles.map((profileId, index) => ({ profile_id: profileId, role: index < 4 ? "campus_lead" : index < 8 ? "counselor" : "coach", assigned_by: signIn.data.user!.id }));
    fail((await service.from("profile_roles" as never).insert(roles as never)).error, "Create roles");
    const specs = [[hayward, "campus_lead_team", "Hayward Lead"], [hayward, "campus_lead_team", "Hayward Lead Two"], [hayward, "counselor_team", "Hayward Counselor"], [fremont, "counselor_team", "Fremont Counselor"], [hayward, "coach_team", "Hayward Coach"]] as const;
    for (const [campusId, groupType, name] of specs) { const result = await service.from("groups").insert({ campus_id: campusId, group_type: groupType as "coach_team", name: `${prefix} ${name}` }).select("id").single(); fail(result.error, `Create ${name}`); groups.push(id(result.data, name)); }
    const [lead, otherLead, haywardCounselor, fremontCounselor, coach] = groups;
    const memberships = [[lead, 0], [lead, 1], [otherLead, 2], [otherLead, 3], [haywardCounselor, 4], [haywardCounselor, 5], [fremontCounselor, 6], [fremontCounselor, 7], [coach, 8], [coach, 9]].map(([groupId, profileIndex]) => ({ group_id: groupId as string, profile_id: profiles[profileIndex as number] }));
    fail((await service.from("group_members").insert(memberships)).error, "Create memberships");
    const rpc = admin as unknown as { rpc(name: "assign_campus_lead_counselor", args: { target_campus_lead_group_id: string; target_counselor_group_id: string }): Promise<Result>; rpc(name: "unassign_campus_lead_counselor", args: { target_campus_lead_group_id: string; target_counselor_group_id: string }): Promise<Result>; rpc(name: "assign_counselor_coach_supervision", args: { target_counselor_group_id: string; target_coach_group_id: string }): Promise<Result> };
    fail((await rpc.rpc("assign_counselor_coach_supervision", { target_counselor_group_id: haywardCounselor, target_coach_group_id: coach })).error, "Create independent Coach supervision");
    fail((await rpc.rpc("assign_campus_lead_counselor", { target_campus_lead_group_id: lead, target_counselor_group_id: haywardCounselor })).error, "Assign same-campus Counselor");
    if (!(await rpc.rpc("assign_campus_lead_counselor", { target_campus_lead_group_id: lead, target_counselor_group_id: fremontCounselor })).error) throw new Error("Cross-campus Campus Lead Counselor assignment was accepted");
    if (!(await rpc.rpc("assign_campus_lead_counselor", { target_campus_lead_group_id: otherLead, target_counselor_group_id: haywardCounselor })).error) throw new Error("Second active Campus Lead Counselor assignment was accepted");
    const supervisedBefore = await service.from("supervision_assignments").select("id").eq("counselor_group_id", haywardCounselor).is("ended_at", null); fail(supervisedBefore.error, "Read Coach supervision"); if (supervisedBefore.data?.length !== 1) throw new Error("Coach supervision changed during Campus Lead assignment");
    fail((await rpc.rpc("unassign_campus_lead_counselor", { target_campus_lead_group_id: lead, target_counselor_group_id: haywardCounselor })).error, "Unassign Campus Lead Counselor");
    const history = await (service as unknown as { from(table: "campus_lead_counselor_assignments"): { select(columns: string): { eq(column: string, value: string): { eq(column: string, value: string): Promise<{ data: Array<{ id: string; ended_at: string | null }> | null; error: { message: string } | null }> } } } }).from("campus_lead_counselor_assignments").select("id,ended_at").eq("campus_lead_group_id", lead).eq("counselor_group_id", haywardCounselor); fail(history.error, "Read Campus Lead Counselor history"); if (history.data?.length !== 1 || !history.data[0]?.ended_at) throw new Error("Campus Lead Counselor history was not preserved");
    fail((await rpc.rpc("assign_campus_lead_counselor", { target_campus_lead_group_id: otherLead, target_counselor_group_id: haywardCounselor })).error, "Reassign ended Counselor");
    const supervisedAfter = await service.from("supervision_assignments").select("id").eq("counselor_group_id", haywardCounselor).is("ended_at", null); fail(supervisedAfter.error, "Read Coach supervision after reassignment"); if (supervisedAfter.data?.length !== 1) throw new Error("Coach supervision changed during Campus Lead reassignment");
    console.log("DEV Campus Lead Counselor assignment, same-campus enforcement, uniqueness, history, and Coach supervision independence verified.");
  } catch (error) {
    primaryFailure = error;
  }
  let cleanupFailure: unknown;
  try {
    console.log("Removed Campus Lead Counselor verifier artifacts:", await cleanupCampusLeadCounselorVerifierArtifacts(service));
  } catch (error) {
    cleanupFailure = error;
  }
  if (primaryFailure && cleanupFailure) throw new AggregateError([primaryFailure, cleanupFailure], "Campus Lead Counselor verifier and cleanup both failed");
  if (primaryFailure) throw primaryFailure;
  if (cleanupFailure) throw cleanupFailure;
}

await main();
