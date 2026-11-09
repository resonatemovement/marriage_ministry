import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getIntakeRequestAlerts } from "@/features/intake-requests/alert-queries";
import { getPeopleRecords } from "@/features/people/queries";
import { coupleDisplayName } from "@/features/people/types";
import { counselingStatusLabel } from "@/lib/counseling/domain";

import { MINISTRY_PROGRESSION_STAGES } from "@/lib/counseling/progression";
import { calculateDashboardCounts, canReadAdminDashboard, canReadSharedDashboard, dashboardProgressionHref, dashboardSessionHref, intakeAttentionItems, dedupeDashboardAttentionItems, type DashboardAttentionItem, type DashboardCase, type DashboardCounts, type DashboardProgression } from "./data";

type AdminDashboardResult =
  | { counts: DashboardCounts; error: null }
  | { counts: null; error: "unauthorized" | "unavailable" };

export async function getAdminDashboardCounts(): Promise<AdminDashboardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") return { counts: null, error: "unauthorized" };

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("status").eq("id", profileId).maybeSingle(),
    supabase.from("profile_roles").select("role").eq("profile_id", profileId),
  ]);
  if (profileError || rolesError) return { counts: null, error: "unavailable" };
  if (profile?.status !== "active" || !canReadAdminDashboard(roleRows?.map(({ role }) => role) ?? [])) {
    return { counts: null, error: "unauthorized" };
  }

  const [couplesResult, casesResult, intakesResult] = await Promise.all([
    supabase.from("groups").select("id").eq("group_type", "couple").eq("active", true),
    supabase.from("counseling_cases").select("couple_group_id,status,case_assignments(assignment_type,ended_at)"),
    supabase.from("intake_requests").select("id", { count: "exact", head: true }).eq("status", "under_review"),
  ]);
  if (couplesResult.error || casesResult.error || intakesResult.error || intakesResult.count === null) return { counts: null, error: "unavailable" };

  return {
    counts: calculateDashboardCounts(
      (couplesResult.data ?? []).map(({ id }) => id),
      (casesResult.data ?? []) as unknown as DashboardCase[],
      intakesResult.count,
    ),
    error: null,
  };
}

type DashboardAggregate = {
  unassigned_couples?: unknown;
  active_couples?: unknown;
  under_review_intakes?: unknown;
  completed_couples?: unknown;
  current_cases?: unknown;
  workflow?: unknown;
};

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function getCampusLeadDashboardCounts(): Promise<AdminDashboardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") return { counts: null, error: "unauthorized" };

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("status").eq("id", profileId).maybeSingle(),
    supabase.from("profile_roles").select("role").eq("profile_id", profileId),
  ]);
  const roles = roleRows?.map(({ role }) => role) ?? [];
  if (profileError || rolesError) return { counts: null, error: "unavailable" };
  if (profile?.status !== "active" || !roles.includes("campus_lead") || canReadAdminDashboard(roles)) return { counts: null, error: "unauthorized" };

  const rpc = supabase as unknown as { rpc(name: "get_campus_lead_dashboard_metrics"): Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("get_campus_lead_dashboard_metrics");
  if (error || !data || typeof data !== "object") return { counts: null, error: "unavailable" };
  const aggregate = data as DashboardAggregate;
  const workflowRows = Array.isArray(aggregate.workflow) ? aggregate.workflow : [];
  const workflowByStatus = new Map(workflowRows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { status?: unknown; count?: unknown };
    return typeof row.status === "string" && integer(row.count) !== null ? [[row.status, integer(row.count)!] as const] : [];
  }));
  const counts = [aggregate.unassigned_couples, aggregate.active_couples, aggregate.under_review_intakes, aggregate.completed_couples, aggregate.current_cases].map(integer);
  if (counts.some((count) => count === null)) return { counts: null, error: "unavailable" };
  const stages = [
    ["requested", "Requested"], ["assessment", "Assessment"], ["interviewed", "Interviewed"],
    ["matched", "Matched"], ["active", "Active"], ["finished", "Finished"],
    ["referred", "Referred"], ["inactive", "Closed — Incomplete"],
  ] as const;

  return { counts: {
    unassignedCouples: counts[0]!, activeCouples: counts[1]!, underReviewIntakes: counts[2]!,
    completedCouples: counts[3]!, currentCases: counts[4]!,
    workflow: stages.map(([status, label]) => ({ status, label, count: workflowByStatus.get(status) ?? 0 })),
  }, error: null };
}

export async function getDashboardCounselingProgression(canNavigate: boolean): Promise<{ progression: DashboardProgression | null; error: "unauthorized" | "unavailable" | null }> {
  const supabase = await createServerSupabaseClient();
  const rpc = supabase as unknown as { rpc(name: "get_dashboard_counseling_progression"): Promise<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await rpc.rpc("get_dashboard_counseling_progression");
  if (error || !data || typeof data !== "object") return { progression: null, error: error ? "unauthorized" : "unavailable" };

  const raw = data as { stages?: unknown; sessions?: unknown; unclassified_count?: unknown };
  const stageRows = Array.isArray(raw.stages) ? raw.stages : [];
  const sessionRows = Array.isArray(raw.sessions) ? raw.sessions : [];
  const stageById = new Map(stageRows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; count?: unknown };
    return typeof row.id === "string" && integer(row.count) !== null ? [[row.id, integer(row.count)!] as const] : [];
  }));
  const sessions = sessionRows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; number?: unknown; title?: unknown; count?: unknown };
    if (typeof row.id !== "string" || typeof row.title !== "string" || integer(row.count) === null) return [];
    const number = row.number === null ? null : integer(row.number);
    if (row.number !== null && number === null) return [];
    return [{ id: row.id, number, title: row.title, count: integer(row.count)!, href: canNavigate ? dashboardSessionHref(row.id) : null }];
  });
  const unclassifiedCount = integer(raw.unclassified_count);
  if (unclassifiedCount === null || stageById.size !== MINISTRY_PROGRESSION_STAGES.length || sessions.length !== sessionRows.length) return { progression: null, error: "unavailable" };

  return {
    progression: {
      stages: MINISTRY_PROGRESSION_STAGES.map((stage) => ({
        ...stage,
        count: stageById.get(stage.id)!,
        href: stage.id === "intake" ? "/intake-requests?view=open" : canNavigate ? dashboardProgressionHref(stage.id) : null,
      })),
      sessions,
      unclassifiedCount,
    },
    error: null,
  };
}

export async function getDashboardAttentionItems(identity: { id: string; roles: readonly string[]; workspaces: readonly string[] }): Promise<{ items: DashboardAttentionItem[] | null; error: "unauthorized" | "unavailable" | null }> {
  if (!canReadSharedDashboard(identity.roles)) return { items: null, error: "unauthorized" };
  const isAdmin = canReadAdminDashboard(identity.roles);
  const [{ alerts, error: alertError }, unassigned] = await Promise.all([
    getIntakeRequestAlerts(),
    isAdmin
      ? getPeopleRecords("couples", "", "unassigned")
      : getCampusLeadUnassignedCandidates(identity.id),
  ]);
  if (alertError || ("error" in unassigned && unassigned.error)) return { items: null, error: "unavailable" };

  const intakeItems = intakeAttentionItems(alerts);
  const coupleItems: DashboardAttentionItem[] = "records" in unassigned
    ? unassigned.records.map((record) => ({ id: `couple:${record.id}`, category: "Unassigned Couple", title: record.name, detail: `Unassigned · ${record.campus ?? "Campus not assigned"} · ${record.status ?? "No Case"}`, href: `/people/${record.id}` }))
    : unassigned.candidates.map((candidate) => ({ id: `couple:${candidate.id}`, category: "Unassigned Couple", title: candidate.name, detail: `Unassigned · ${candidate.campus} · ${candidate.caseStatus ?? "No Case"}`, href: candidate.href }));
  return { items: dedupeDashboardAttentionItems([...intakeItems, ...coupleItems]), error: null };
}

async function getCampusLeadUnassignedCandidates(profileId: string) {
  const supabase = await createServerSupabaseClient();
  const [{ data: campuses, error: campusesError }, { data: teams, error: teamsError }] = await Promise.all([
    supabase.from("campus_lead_assignments").select("campus_id,campuses!inner(active)").eq("profile_id", profileId).is("ended_at", null),
    supabase.from("groups").select("id,campus_id").eq("group_type", "campus_lead_team" as "couple").eq("active", true).eq("group_members.profile_id", profileId).is("group_members.ended_at", null),
  ]);
  if (campusesError || teamsError) return { candidates: [], error: "unavailable" as const };
  const activeCampusIds = (campuses ?? []).filter((row) => row.campuses?.active === true).map(({ campus_id }) => campus_id);
  const rpc = supabase as unknown as { rpc(name: "get_campus_lead_assignment_candidates", args: { target_campus_id: string }): Promise<{ data: unknown; error: { message: string } | null }> };
  const results = await Promise.all(activeCampusIds.map((campusId) => rpc.rpc("get_campus_lead_assignment_candidates", { target_campus_id: campusId })));
  if (results.some(({ error }) => error)) return { candidates: [], error: "unavailable" as const };
  const teamByCampus = new Map((teams ?? []).map(({ id, campus_id }) => [campus_id, id]));
  const rows = results.flatMap(({ data }) => Array.isArray(data) ? data as { couple_group_id?: unknown; campus_id?: unknown; campus_name?: unknown; group_name?: unknown; case_status?: unknown; assignment_eligible?: unknown; partners?: unknown }[] : []);
  const candidates = rows.filter((row) => row.assignment_eligible === true && typeof row.couple_group_id === "string" && typeof row.campus_id === "string" && typeof row.campus_name === "string" && typeof teamByCampus.get(row.campus_id) === "string").map((row) => {
    const campusId = row.campus_id as string;
    const partners = Array.isArray(row.partners) ? row.partners as { firstName?: unknown; lastName?: unknown; gender?: unknown }[] : [];
    const names: { firstName: string | null; lastName: string | null; gender: "male" | "female" | null }[] = partners.map(({ firstName, lastName, gender }) => ({ firstName: typeof firstName === "string" ? firstName : null, lastName: typeof lastName === "string" ? lastName : null, gender: gender === "male" || gender === "female" ? gender : null }));
    const groupName = typeof row.group_name === "string" ? row.group_name : null;
    const name = coupleDisplayName(groupName, names, []);
    const caseStatus = typeof row.case_status === "string" ? row.case_status : null;
    return { id: row.couple_group_id as string, campus: row.campus_name as string, caseStatus: caseStatus ? counselingStatusLabel(caseStatus, false, false) : null, name, href: `/people/${teamByCampus.get(campusId)}` };
  });
  return { candidates, error: null };
}
