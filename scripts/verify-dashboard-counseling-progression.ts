import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { coupleOnboardingStatus, coupleProgressionStage, currentCounselingSessionKey } from "../lib/counseling/progression.ts";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
type Client = SupabaseClient<Database>;
type Json = Record<string, unknown>;
type Expected = { stages: { id: string; label: string; valueLabel: string; count: number }[]; sessions: { id: string; number: number | null; title: string; count: number }[]; unclassified_count: number };
const stageDefinitions = [
  ["intake", "Intake", "Intake Requests"], ["onboarding", "Onboarding", "Couples"],
  ["awaiting_assignment", "Awaiting Assignment", "Couples"], ["counseling", "Counseling", "Couples"],
  ["completed", "Completed", "Couples"], ["referred", "Referred", "Couples"],
  ["closed_incomplete", "Closed — Incomplete", "Couples"],
] as const;

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function fail(error: { message: string } | null, action: string) { if (error) throw new Error(`${action}: ${error.message}`); }
function rows(value: unknown): Json[] { return Array.isArray(value) ? value as Json[] : []; }
function same(actual: unknown, expected: unknown, message: string) {
  const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sort(item)])) : value;
  assert(JSON.stringify(sort(actual)) === JSON.stringify(sort(expected)), `${message}.`);
}
async function signIn(emailKey: string, passwordKey: string, url: string, key: string) {
  const client = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: required(emailKey), password: required(passwordKey) });
  fail(error, `Unable to authenticate ${emailKey.replace("_EMAIL", "")}`);
  assert(data.session, "Authenticated DEV session was not returned.");
  return client;
}
async function progression(client: Client) {
  const caller = client as unknown as { rpc(name: "get_dashboard_counseling_progression"): Promise<{ data: unknown; error: { message: string } | null }> };
  return caller.rpc("get_dashboard_counseling_progression");
}
async function expectDenied(client: Client, label: string) {
  const { data, error } = await progression(client);
  assert(error && !data, `${label} unexpectedly read Dashboard counseling progression.`);
}

async function expectedFor(service: Client, campusIds?: readonly string[]): Promise<Expected> {
  const groupsQuery = service.from("groups").select("id,campus_id").eq("group_type", "couple").eq("active", true);
  const { data: groups, error: groupsError } = campusIds ? await groupsQuery.in("campus_id", [...campusIds]) : await groupsQuery;
  fail(groupsError, "Unable to read DEV Couple aggregate source");
  const ids = (groups ?? []).map(({ id }) => id);
  const [membersResult, invitationsResult, casesResult, sessionsResult, intakesResult] = await Promise.all([
    ids.length ? service.from("group_members").select("group_id,profile:profiles!group_members_profile_id_fkey(onboarding_completed_at)").in("group_id", ids).is("ended_at", null) : Promise.resolve({ data: [], error: null }),
    ids.length ? service.from("invitations").select("group_id,intended_role,status").in("group_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? service.from("counseling_cases").select("id,couple_group_id,status,case_assignments(assignment_type,ended_at)").in("couple_group_id", ids) : Promise.resolve({ data: [], error: null }),
    service.from("sessions").select("id,title,sequence_number").eq("status", "published").order("sequence_number"),
    service.from("intake_requests").select("id,status,campus_id,invited_group_id").in("status", ["ready_for_review", "under_review", "ready_to_invite", "invited"]),
  ]);
  for (const [result, label] of [[membersResult, "members"], [invitationsResult, "invitations"], [casesResult, "Cases"], [sessionsResult, "published Sessions"], [intakesResult, "Intake Requests"]] as const) fail(result.error, `Unable to read DEV ${label}`);

  const groupIds = new Set(ids);
  const memberRows = rows(membersResult.data);
  const invitationRows = rows(invitationsResult.data);
  const caseByGroup = new Map(rows(casesResult.data).map((row) => [String(row.couple_group_id), row]));
  const published = (sessionsResult.data ?? []).map((session, index) => ({ id: session.id, number: index + 1, title: session.title }));
  const publishedIds = new Set(published.map(({ id }) => id));
  const caseIds = rows(casesResult.data).map((row) => String(row.id));
  const activeSessionsResult = caseIds.length ? await service.from("case_sessions").select("counseling_case_id,session_id,actual_sequence").eq("status", "active").in("counseling_case_id", caseIds) : { data: [], error: null };
  fail(activeSessionsResult.error, "Unable to read current DEV Case Sessions");
  const activeSessionByCase = new Map(rows(activeSessionsResult.data).map((row) => [String(row.counseling_case_id), String(row.session_id)]));
  const stageCounts = new Map<string, number>(stageDefinitions.map(([id]) => [id, 0]));
  const sessionCounts = new Map<string, number>([["initial", 0], ...published.map(({ id }) => [id, 0] as [string, number])]);
  let unclassified = 0;

  for (const groupId of groupIds) {
    const counselingCase = caseByGroup.get(groupId);
    const members = memberRows.filter((row) => row.group_id === groupId).map((row) => {
      const profile = row.profile as Json | null;
      return profile?.onboarding_completed_at !== null && profile?.onboarding_completed_at !== undefined;
    });
    const invitations = invitationRows.filter((row) => row.group_id === groupId && row.intended_role === "couple" && ["pending", "accepted"].includes(String(row.status)));
    const onboarding = coupleOnboardingStatus(members, invitations.length);
    const assignments = rows(counselingCase?.case_assignments);
    const hasCounselor = assignments.some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null);
    const status = counselingCase?.status as Parameters<typeof coupleProgressionStage>[0]["caseStatus"] ?? null;
    const stage = coupleProgressionStage({ caseStatus: status, hasCounselorOfRecord: hasCounselor, onboarding });
    if (!stage) { unclassified += 1; continue; }
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    if (stage === "counseling") {
      const activeSessionId = counselingCase ? activeSessionByCase.get(String(counselingCase.id)) ?? null : null;
      const key = currentCounselingSessionKey({ caseStatus: status, hasCounselorOfRecord: hasCounselor, activeSessionId, publishedSessionIds: publishedIds });
      if (key) sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1);
      else if (activeSessionId) unclassified += 1;
    }
  }

  const allowedCampusIds = campusIds ? new Set(campusIds) : null;
  const inScope = (campusId: string | null) => !allowedCampusIds || (campusId !== null && allowedCampusIds.has(campusId));
  const intakes = (intakesResult.data ?? []).filter((request) => request.invited_group_id === null && ["ready_for_review", "under_review", "ready_to_invite"].includes(request.status) && inScope(request.campus_id)).length;
  unclassified += (intakesResult.data ?? []).filter((request) => request.status === "invited" && request.invited_group_id === null && inScope(request.campus_id)).length;
  const stages = stageDefinitions.map(([id, label, valueLabel]) => ({ id, label, valueLabel, count: id === "intake" ? intakes : stageCounts.get(id) ?? 0 }));
  const sessionsJson = [
    { id: "initial", number: null, title: "Initial Meeting", count: sessionCounts.get("initial") ?? 0 },
    ...published.map(({ id, number, title }) => ({ id, number, title, count: sessionCounts.get(id) ?? 0 })),
  ];
  return { stages, sessions: sessionsJson, unclassified_count: unclassified };
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Dashboard progression verification refused: configured project is not approved DEV.");
  const service = createClient<Database>(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const [admin, superAdmin, campusLead, coach, counselor, couple] = await Promise.all([
    signIn("TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD", url, publishableKey),
    signIn("TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD", url, publishableKey),
    signIn("TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD", url, publishableKey),
    signIn("TEST_COACH_EMAIL", "TEST_COACH_PASSWORD", url, publishableKey),
    signIn("TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD", url, publishableKey),
    signIn("TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD", url, publishableKey),
  ]);
  const anonymous = createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [{ data: adminData, error: adminError }, { data: superData, error: superError }, leadResult, campusesResult] = await Promise.all([
    progression(admin), progression(superAdmin), progression(campusLead),
    campusLead.from("campus_lead_assignments").select("campus_id,campuses!inner(active)").is("ended_at", null),
  ]);
  fail(adminError, "Admin aggregate query failed"); fail(superError, "Super Admin aggregate query failed"); fail(leadResult.error, "Campus Lead aggregate query failed");
  assert(adminData && typeof adminData === "object" && superData && typeof superData === "object" && leadResult.data && typeof leadResult.data === "object", "Authorized progression query returned no data.");
  same(superData, adminData, "Admin and Super Admin global counts differ");
  fail(campusesResult.error, "Unable to read assigned Campus Lead scope");
  const campusIds = [...new Set((campusesResult.data ?? []).filter((row) => row.campuses?.active).map(({ campus_id }) => campus_id))];
  assert(campusIds.length > 0, "Campus Lead account has no active assigned campus to verify.");
  same(leadResult.data, await expectedFor(service, campusIds), "Campus Lead RPC did not match assigned-campus DEV records");
  same(adminData, await expectedFor(service), "Global RPC did not match ministry-wide DEV records");
  const { data: activeCampuses, error: activeCampusesError } = await service.from("campuses").select("id").eq("active", true);
  fail(activeCampusesError, "Unable to read active DEV campuses");
  const outsideCampusIds = (activeCampuses ?? []).map(({ id }) => id).filter((id) => !campusIds.includes(id));
  let crossCampusCoupleDenied = false;
  if (outsideCampusIds.length) {
    const { data: outsideCouple, error: outsideCoupleError } = await service.from("groups").select("id").eq("group_type", "couple").eq("active", true).in("campus_id", outsideCampusIds).limit(1).maybeSingle();
    fail(outsideCoupleError, "Unable to identify an out-of-scope DEV Couple");
    if (outsideCouple) {
      const { data: scopedRead, error: scopedReadError } = await campusLead.from("groups").select("id").eq("id", outsideCouple.id).maybeSingle();
      assert(!scopedReadError && !scopedRead, "Campus Lead unexpectedly read a Couple outside assigned-campus scope.");
      crossCampusCoupleDenied = true;
    }
  }
  await Promise.all([expectDenied(coach, "Coach"), expectDenied(counselor, "Counselor"), expectDenied(couple, "Couple"), expectDenied(anonymous, "Unauthenticated user")]);

  const stages = (adminData as Json).stages as { id: string; count: number }[];
  const sessions = (adminData as Json).sessions as { id: string; number: number | null; title: string; count: number }[];
  console.log(`Progression DEV verification passed. Global stages: ${JSON.stringify(stages.map(({ id, count }) => ({ id, count })))}; session tiles: ${sessions.length} including Initial Meeting; unclassified: ${(adminData as Json).unclassified_count}.`);
  console.log(`Campus Lead scoped aggregate matched ${campusIds.length} active assigned campus/campuses; direct cross-campus Couple read ${crossCampusCoupleDenied ? "was denied" : "could not be exercised because no out-of-scope active Couple was available"}. Coach, Counselor, Couple, and unauthenticated RPC calls were denied.`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
