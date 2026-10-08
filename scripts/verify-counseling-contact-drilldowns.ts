import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const fail = (error: { message: string } | null, action: string) => { if (error) throw new Error(`${action}: ${error.message}`); };

function client(url: string, key: string) { return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function signedIn(url: string, key: string, emailName: string, passwordName: string) {
  const value = client(url, key);
  const { data, error } = await value.auth.signInWithPassword({ email: required(emailName).toLowerCase(), password: required(passwordName) });
  fail(error, `Sign in ${emailName}`);
  if (!data.session) throw new Error(`No session for ${emailName}`);
  return { value, token: data.session.access_token };
}
async function contact(url: string, key: string, token: string | null, caseId: string, groupId: string) {
  return fetch(`${url}/rest/v1/rpc/get_counseling_contact_group`, { method: "POST", headers: { apikey: key, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ target_case_id: caseId, target_group_id: groupId }) });
}
async function hasContact(response: Response) {
  if (!response.ok) return false;
  const payload = await response.json() as unknown;
  return Array.isArray(payload) && payload.length > 0;
}

async function verify() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Counseling contact verification refused outside approved DEV.");
  const [admin, couple, counselor, unassignedCareMember] = await Promise.all([
    signedIn(url, publishableKey, "TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD"),
    signedIn(url, publishableKey, "TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD"),
    signedIn(url, publishableKey, "TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD"),
    signedIn(url, publishableKey, "TEST_COACH_3_EMAIL", "TEST_COACH_3_PASSWORD"),
  ]);
  const { data: groups, error: groupError } = await admin.value.from("groups").select("id,name").in("name", ["DEV Test Couple", "DEV Test Coach Team", "DEV Test Counselor Team"]);
  fail(groupError, "Read DEV contact fixtures");
  const ids = new Map((groups ?? []).map((group) => [group.name, group.id]));
  const coupleGroup = ids.get("DEV Test Couple"), coachGroup = ids.get("DEV Test Coach Team"), counselorGroup = ids.get("DEV Test Counselor Team");
  if (!coupleGroup || !coachGroup || !counselorGroup) throw new Error("DEV contact fixtures are incomplete. Run npm run setup:test-users first.");
  const { data: counselingCase, error: caseError } = await admin.value.from("counseling_cases").select("id").eq("couple_group_id", coupleGroup).single();
  fail(caseError, "Read DEV Couple case");
  if (!counselingCase) throw new Error("DEV contact case is missing.");

  try {
    fail((await admin.value.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: coupleGroup, target_group_id: counselorGroup, target_profile_id: null, target_assignment_type: "counselor" })).error, "Assign DEV Counselor contact fixture");
    const allowedCounselor = await contact(url, publishableKey, couple.token, counselingCase.id, counselorGroup);
    if (!allowedCounselor.ok || !(await allowedCounselor.json() as unknown[]).length) throw new Error("Couple could not retrieve assigned Counselor contact details");
    for (const [label, groupId] of [["Coach", coachGroup], ["own Couple", coupleGroup]] as const) {
      if (await hasContact(await contact(url, publishableKey, couple.token, counselingCase.id, groupId))) {
        throw new Error(`Couple retrieved ${label} contact details`);
      }
    }
    const allowedCouple = await contact(url, publishableKey, counselor.token, counselingCase.id, coupleGroup);
    const partners = await allowedCouple.json() as unknown[];
    if (!allowedCouple.ok || partners.length !== 2) throw new Error("Assigned Counselor could not retrieve both Couple contacts");
    if (await hasContact(await contact(url, publishableKey, unassignedCareMember.token, counselingCase.id, coupleGroup))) throw new Error("Unassigned care-team user retrieved Couple contact details");
    if (await hasContact(await contact(url, publishableKey, counselor.token, "00000000-0000-0000-0000-000000000000", coupleGroup))) throw new Error("Counselor retrieved contact details for an unrelated case");
    if (await hasContact(await contact(url, publishableKey, null, counselingCase.id, counselorGroup))) throw new Error("Unauthenticated caller retrieved protected contact details");
  } finally {
    fail((await admin.value.rpc("ensure_and_assign_counseling_case", { target_couple_group_id: coupleGroup, target_group_id: coachGroup, target_profile_id: null, target_assignment_type: "coach" })).error, "Restore DEV Coach fixture assignment");
  }
  console.log("DEV counseling contact allow/deny contract verified and fixture assignment restored.");
}

await verify();
