import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
type Client = SupabaseClient<Database>;
type Aggregate = { unassigned_couples: number; active_couples: number; under_review_intakes: number; completed_couples: number; current_cases: number; workflow: { status: string; count: number }[] };
type CaseRow = { couple_group_id: string; status: string; case_assignments: { assignment_type: string; ended_at: string | null }[] | null };
const statuses = ["requested", "assessment", "interviewed", "matched", "active", "finished", "referred", "inactive"];

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function same(actual: unknown, expected: unknown, message: string) { assert(JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)), `${message} Actual=${JSON.stringify(actual)} Expected=${JSON.stringify(expected)}`); }

function expected(couples: readonly { id: string }[], cases: readonly CaseRow[], underReviewIntakes: number): Aggregate {
  const ids = new Set(couples.map(({ id }) => id));
  const current = new Map(cases.filter(({ couple_group_id }) => ids.has(couple_group_id)).map((row) => [row.couple_group_id, row]));
  const workflow = statuses.map((status) => ({ status, count: [...current.values()].filter((row) => row.status === status).length }));
  return {
    unassigned_couples: couples.filter(({ id }) => !(current.get(id)?.case_assignments ?? []).some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null)).length,
    active_couples: workflow.find(({ status }) => status === "active")!.count,
    under_review_intakes: underReviewIntakes,
    completed_couples: workflow.find(({ status }) => status === "finished")!.count,
    current_cases: current.size,
    workflow,
  };
}

async function signIn(emailName: string, passwordName: string, url: string, key: string) {
  const client = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await client.auth.signInWithPassword({ email: required(emailName), password: required(passwordName) });
  fail(result.error, `Unable to authenticate ${emailName.replace(/_EMAIL$/, "")}`);
  assert(result.data.session, "Authenticated DEV session was not returned.");
  return client;
}

async function rpc(client: Client) {
  const caller = client as unknown as { rpc(name: "get_campus_lead_dashboard_metrics"): Promise<{ data: unknown; error: { message: string } | null }> };
  return caller.rpc("get_campus_lead_dashboard_metrics");
}

async function alerts(client: Client, targetCampusId?: string) {
  const caller = client as unknown as { rpc(name: "get_intake_request_alerts", args: { target_campus_id?: string }): Promise<{ data: unknown; error: { message: string } | null }> };
  return caller.rpc("get_intake_request_alerts", targetCampusId ? { target_campus_id: targetCampusId } : {});
}

async function mustBeDenied(client: Client, label: string) {
  const { data, error } = await rpc(client);
  assert(error && !data, `${label} unexpectedly read Campus Lead aggregate dashboard data.`);
}

async function readCount(client: Client) {
  const { count, error } = await client.from("intake_requests").select("id", { count: "exact", head: true }).eq("status", "under_review");
  fail(error, "Unable to count Under Review Intake Requests");
  assert(count !== null, "Under Review Intake Request count is unavailable.");
  return count;
}

async function readDashboardSources(client: Client) {
  const [{ data: couples, error: couplesError }, { data: cases, error: casesError }, underReviewIntakes] = await Promise.all([
    client.from("groups").select("id").eq("group_type", "couple").eq("active", true),
    client.from("counseling_cases").select("couple_group_id,status,case_assignments(assignment_type,ended_at)"),
    readCount(client),
  ]);
  fail(couplesError, "Unable to read authorized active Couple aggregate source");
  fail(casesError, "Unable to read authorized current Case aggregate source");
  return expected(couples ?? [], (cases ?? []) as unknown as CaseRow[], underReviewIntakes);
}

async function compareLeadScope(client: Client, service: Client, campusIds: string[], aggregate: unknown, label: string) {
  const [{ data: couples, error: coupleError }, underReviewIntakes] = await Promise.all([
    service.from("groups").select("id").eq("group_type", "couple").eq("active", true).in("campus_id", campusIds),
    readCount(client),
  ]);
  fail(coupleError, `Unable to independently verify ${label} scoped Couple count`);
  const coupleIds = (couples ?? []).map(({ id }) => id);
  let cases: CaseRow[] = [];
  if (coupleIds.length) {
    const result = await service.from("counseling_cases").select("couple_group_id,status,case_assignments(assignment_type,ended_at)").in("couple_group_id", coupleIds);
    fail(result.error, `Unable to independently verify ${label} scoped Case count`);
    cases = (result.data ?? []) as unknown as CaseRow[];
  }
  same(aggregate, expected(couples ?? [], cases, underReviewIntakes), `${label} Dashboard aggregate does not match assigned-campus records.`);
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Shared Dashboard verification refused: configured project is not approved DEV.");
  const service = createClient<Database>(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const [admin, superAdmin, campusLead, secondCampusLead, coach, counselor, couple] = await Promise.all([
    signIn("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD", url, publishableKey),
    signIn("TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD", url, publishableKey),
    signIn("TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD", url, publishableKey),
    signIn("TEST_CAMPUS_LEAD_2_EMAIL", "TEST_CAMPUS_LEAD_2_PASSWORD", url, publishableKey),
    signIn("TEST_COACH_EMAIL", "TEST_COACH_PASSWORD", url, publishableKey),
    signIn("TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD", url, publishableKey),
    signIn("TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD", url, publishableKey),
  ]);
  const anonymous = createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const [adminData, superAdminData, leadResult, leadScopes, secondLeadScopes, adminAlerts, leadAlerts] = await Promise.all([
    readDashboardSources(admin),
    readDashboardSources(superAdmin),
    rpc(campusLead),
    campusLead.from("campus_lead_assignments").select("campus_id").is("ended_at", null),
    secondCampusLead.from("campus_lead_assignments").select("campus_id").is("ended_at", null),
    alerts(admin),
    alerts(campusLead),
  ]);
  same(superAdminData, adminData, "Admin and Super Admin did not receive matching ministry-wide aggregate values.");
  fail(leadScopes.error, "Unable to read first Campus Lead active campus scope");
  fail(secondLeadScopes.error, "Unable to read second Campus Lead active campus scope");
  assert((leadScopes.data ?? []).length > 0 && (secondLeadScopes.data ?? []).length > 0, "Both Campus Lead verification accounts require an active assigned campus.");
  fail(leadResult.error, "Campus Lead could not read its authorized dashboard aggregate");
  assert(leadResult.data && typeof leadResult.data === "object", "Campus Lead aggregate returned no data.");
  fail(adminAlerts.error, "Admin could not read global Intake alerts");
  fail(leadAlerts.error, "Campus Lead could not read assigned-campus Intake alerts");

  const allowedCampusIds = new Set((leadScopes.data ?? []).map(({ campus_id }) => campus_id));
  assert(Array.isArray(leadAlerts.data) && leadAlerts.data.every((item) => item && typeof item === "object" && allowedCampusIds.has((item as { campus_id?: string }).campus_id ?? "")), "Campus Lead Intake alert results included a campus outside its active scope.");
  await compareLeadScope(campusLead, service, [...allowedCampusIds], leadResult.data, "First Campus Lead");

  await Promise.all([
    mustBeDenied(admin, "Admin"), mustBeDenied(superAdmin, "Super Admin"), mustBeDenied(coach, "Coach"),
    mustBeDenied(counselor, "Counselor"), mustBeDenied(couple, "Couple"), mustBeDenied(anonymous, "Unauthenticated user"),
  ]);
  const { data: otherCampus, error: otherCampusError } = await service.from("campuses").select("id").eq("active", true).not("id", "in", `(${[...allowedCampusIds].join(",")})`).limit(1).maybeSingle();
  fail(otherCampusError, "Unable to identify a campus outside the test Campus Lead scope");
  assert(otherCampus, "No active campus exists outside the primary Campus Lead scope; cross-campus denial could not be tested.");
  const { data: unauthorizedCandidates, error: candidateError } = await campusLead.rpc("get_campus_lead_assignment_candidates", { target_campus_id: otherCampus.id });
  assert(candidateError && !unauthorizedCandidates, "Campus Lead unexpectedly read assignment candidates outside assigned campus scope.");
  const { data: crossCampusAlerts, error: crossCampusAlertError } = await alerts(campusLead, otherCampus.id);
  assert(crossCampusAlertError && !crossCampusAlerts, "Campus Lead unexpectedly read Intake alerts outside assigned campus scope.");
  const { data: outsideCouple, error: outsideCoupleError } = await service.from("groups").select("id,campus_id").eq("group_type", "couple").eq("active", true).eq("campus_id", otherCampus.id).limit(1).maybeSingle();
  fail(outsideCoupleError, "Unable to identify an outside-scope DEV Couple");
  if (outsideCouple) {
    const { data: coupleRead, error: coupleReadError } = await campusLead.from("groups").select("id").eq("id", outsideCouple.id).maybeSingle();
    assert(!coupleReadError && !coupleRead, "Campus Lead unexpectedly read an unrelated Couple identity.");
  }
  const { data: coupleAlerts, error: coupleAlertError } = await alerts(couple);
  assert(coupleAlertError && !coupleAlerts, "Couple unexpectedly read staff-only Intake alerts.");

  const secondLeadResult = await rpc(secondCampusLead);
  fail(secondLeadResult.error, "Second Campus Lead could not read its scoped aggregate");
  assert(secondLeadResult.data && typeof secondLeadResult.data === "object", "Second Campus Lead aggregate returned no data.");
  const secondScope = (secondLeadScopes.data ?? []).map(({ campus_id }) => campus_id);
  await compareLeadScope(secondCampusLead, service, secondScope, secondLeadResult.data, "Second Campus Lead");

  console.log(`Shared Dashboard DEV authorization verified. Counts: ${JSON.stringify({ admin: adminData, campusLead: leadResult.data, secondCampusLead: secondLeadResult.data })}`);
  console.log("Admin/Super Admin global scope, two Campus Lead assigned-campus scopes, Intake alert scope, cross-campus denial, and denial for unauthorized roles were verified.");
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
