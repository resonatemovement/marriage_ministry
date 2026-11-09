import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
import type { Database } from "../types/database.generated.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
type Client = SupabaseClient<Database>;
type Team = { team_id: string; team_name: string; team_type: string; campus_name: string | null; accepting_new_couples: boolean; couple_count: number };
type DbTeam = { id: string; name: string; group_type: string; campus_id: string | null; accepting_new_couples: boolean };
type Assignment = { assigned_group_id: string | null; counseling_case: { couple_group_id: string; couple: { id: string; active: boolean; group_type: string } | null } | null };

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action} failed.`);
}

async function signIn(emailName: string, passwordName: string, url: string, key: string): Promise<Client> {
  const client = createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: required(emailName), password: required(passwordName) });
  fail(error, `Unable to authenticate ${emailName.replace(/_EMAIL$/, "")}`);
  assert(data.session, "Authenticated DEV session was not returned.");
  return client;
}

async function readAvailability(client: Client) {
  const caller = client as unknown as { rpc(name: "get_dashboard_team_availability"): Promise<{ data: unknown; error: { message: string } | null }> };
  return caller.rpc("get_dashboard_team_availability");
}

function canonicalTeams(rows: readonly Team[]) {
  return rows.map(({ team_id, team_name, team_type, campus_name, accepting_new_couples, couple_count }) => ({ team_id, team_name, team_type, campus_name, accepting_new_couples, couple_count }));
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  const expectedHost = `${DEV_PROJECT_REF}.supabase.co`;
  assert(new URL(url).hostname === expectedHost, "Dashboard Team Availability verification refused: configured Supabase URL is not approved DEV.");
  assert(readFileSync("supabase/.temp/project-ref", "utf8").trim() === DEV_PROJECT_REF, "Dashboard Team Availability verification refused: linked Supabase project is not approved DEV.");

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

  const [adminResult, superResult, leadResult, otherLeadResult, teamsResult, assignmentsResult, leadScopeResult, secondLeadScopeResult] = await Promise.all([
    readAvailability(admin), readAvailability(superAdmin), readAvailability(campusLead), readAvailability(secondCampusLead),
    service.from("groups").select("id,name,group_type,campus_id,accepting_new_couples").eq("active", true).in("group_type", ["campus_lead_team", "coach_team", "counselor_team"]),
    service.from("case_assignments").select("assigned_group_id,counseling_case:counseling_cases(couple_group_id,couple:groups!counseling_cases_couple_group_id_fkey(id,active,group_type))").eq("assignment_type", "counselor").is("ended_at", null),
    campusLead.from("campus_lead_assignments").select("campus_id,campus:campuses!inner(active)").is("ended_at", null),
    secondCampusLead.from("campus_lead_assignments").select("campus_id,campus:campuses!inner(active)").is("ended_at", null),
  ]);
  fail(teamsResult.error, "Unable to read DEV team verification source");
  fail(assignmentsResult.error, "Unable to read DEV Counselor-of-record verification source");
  fail(leadScopeResult.error, "Unable to read first Campus Lead scope");
  fail(secondLeadScopeResult.error, "Unable to read second Campus Lead scope");
  fail(adminResult.error, "Admin Team Availability read");
  fail(superResult.error, "Super Admin Team Availability read");
  fail(leadResult.error, "Campus Lead Team Availability read");
  fail(otherLeadResult.error, "Second Campus Lead Team Availability read");

  const dbTeams = (teamsResult.data ?? []) as DbTeam[];
  const assignmentRows = (assignmentsResult.data ?? []) as unknown as Assignment[];
  const coupleIdsByTeam = new Map<string, Set<string>>();
  assignmentRows.forEach(({ assigned_group_id: teamId, counseling_case: counselingCase }) => {
    const coupleGroup = counselingCase?.couple;
    if (!teamId || !counselingCase || !coupleGroup?.active || coupleGroup.group_type !== "couple") return;
    const ids = coupleIdsByTeam.get(teamId) ?? new Set<string>();
    ids.add(counselingCase.couple_group_id);
    coupleIdsByTeam.set(teamId, ids);
  });
  const expectedGlobal: Team[] = dbTeams.map((team) => ({
    team_id: team.id,
    team_name: team.name,
    team_type: team.group_type,
    campus_name: null,
    accepting_new_couples: team.accepting_new_couples,
    couple_count: coupleIdsByTeam.get(team.id)?.size ?? 0,
  })).sort((left, right) => left.couple_count - right.couple_count || left.team_name.localeCompare(right.team_name) || left.team_id.localeCompare(right.team_id));

  const { data: campusRows, error: campusError } = await service.from("campuses").select("id,name").in("id", dbTeams.map(({ campus_id }) => campus_id).filter((id): id is string => Boolean(id)));
  fail(campusError, "Unable to read team campus verification source");
  const campusNames = new Map((campusRows ?? []).map(({ id, name }) => [id, name]));
  expectedGlobal.forEach((row) => {
    const team = dbTeams.find(({ id }) => id === row.team_id)!;
    row.campus_name = team.campus_id ? campusNames.get(team.campus_id) ?? null : null;
  });
  assert(JSON.stringify(canonicalTeams(adminResult.data as Team[])) === JSON.stringify(canonicalTeams(expectedGlobal)), "Admin result did not match the ministry-wide active team and direct assignment source.");
  assert(JSON.stringify(canonicalTeams(superResult.data as Team[])) === JSON.stringify(canonicalTeams(expectedGlobal)), "Super Admin result did not match the ministry-wide active team and direct assignment source.");

  const activeLeadScope = (leadScopeResult.data ?? []).flatMap((row) => row.campus?.active ? [row.campus_id] : []);
  const activeSecondLeadScope = (secondLeadScopeResult.data ?? []).flatMap((row) => row.campus?.active ? [row.campus_id] : []);
  assert(activeLeadScope.length > 0 && activeSecondLeadScope.length > 0, "Campus Lead verification identities need active assigned campuses.");
  const globalByCampus = new Map<string, Team[]>();
  dbTeams.forEach((team) => { if (team.campus_id) globalByCampus.set(team.campus_id, [...(globalByCampus.get(team.campus_id) ?? []), expectedGlobal.find(({ team_id }) => team_id === team.id)!]); });
  const expectedLead = activeLeadScope.flatMap((campusId) => globalByCampus.get(campusId) ?? []).sort((left, right) => left.couple_count - right.couple_count || left.team_name.localeCompare(right.team_name) || left.team_id.localeCompare(right.team_id));
  const expectedSecondLead = activeSecondLeadScope.flatMap((campusId) => globalByCampus.get(campusId) ?? []).sort((left, right) => left.couple_count - right.couple_count || left.team_name.localeCompare(right.team_name) || left.team_id.localeCompare(right.team_id));
  assert(JSON.stringify(canonicalTeams(leadResult.data as Team[])) === JSON.stringify(canonicalTeams(expectedLead)), "Campus Lead result did not match only its active assigned-campus teams.");
  assert(JSON.stringify(canonicalTeams(otherLeadResult.data as Team[])) === JSON.stringify(canonicalTeams(expectedSecondLead)), "Second Campus Lead result did not match only its active assigned-campus teams.");

  const roleClients = [
    [coach, "Coach"], [counselor, "Counselor"], [couple, "Couple"], [anonymous, "Unauthenticated"],
  ] as const;
  for (const [client, label] of roleClients) {
    const { data, error } = await readAvailability(client);
    assert(Boolean(error) && !data, `${label} unexpectedly read Dashboard Team Availability.`);
  }

  const leadCampuses = new Set(activeLeadScope);
  const secondCampuses = new Set(activeSecondLeadScope);
  const crossCampusTeam = dbTeams.find((team) => team.campus_id && !leadCampuses.has(team.campus_id));
  if (crossCampusTeam) assert(!(leadResult.data as Team[]).some(({ team_id }) => team_id === crossCampusTeam.id), "Campus Lead result included a team from outside its active campus scope.");
  const secondLeadCrossCampusTeam = dbTeams.find((team) => team.campus_id && !secondCampuses.has(team.campus_id));
  if (secondLeadCrossCampusTeam) assert(!(otherLeadResult.data as Team[]).some(({ team_id }) => team_id === secondLeadCrossCampusTeam.id), "Second Campus Lead result included a team from outside its active campus scope.");

  const crossCampusStatus = crossCampusTeam ? "an out-of-scope active team was excluded" : "no active out-of-scope team existed for a direct exclusion case";
  console.log(`Dashboard Team Availability DEV authorization verified: Admin/Super Admin ${expectedGlobal.length} global teams; Campus Leads ${expectedLead.length}/${expectedSecondLead.length} campus-scoped teams; ${crossCampusStatus}; unauthorized roles denied; direct Counselor-of-record counts matched.`);
}

await main();
