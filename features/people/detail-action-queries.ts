import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { PeopleDetail } from "./detail-model";
import { eligibleCampusLeadCoachTeams, eligibleCoupleAssignmentTeams, eligibleCoupleOptions, eligibleUnassignedCounselorCoupleOptions, isAssignmentReadyCouple, isOperationalTeamReady, type PeopleDetailActionContext, type TeamOption } from "./detail-actions-model";
import { coupleDisplayName } from "./types";

type Row = Record<string, unknown>;
const readinessProfileSelection = "status,onboarding_completed_at,first_name,last_name,email,campus_id,phone,photo_path";

function value(row: Row | null | undefined, key: string) {
  return typeof row?.[key] === "string" ? row[key] as string : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? value as Row[] : [];
}

function asTeamOption(row: Row): TeamOption {
  const campus = row.campus as Row | null;
  return { id: value(row, "id")!, name: value(row, "name")!, campus: value(campus, "name"), campusId: value(campus, "id"), type: row.group_type === "coach_team" ? "coach" : row.group_type === "counselor_team" ? "counselor" : "campus_lead", active: row.active !== false };
}

function counselorTeamsFromSupervisionRows(rows: Row[]) {
  return rows.map((assignment) => asTeamOption(assignment.counselor_group as Row));
}

function readyTeamOptions(rows: Row[]) {
  return rows.filter((team) => isOperationalTeamReady((Array.isArray(team.group_members) ? team.group_members : []) as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, (Array.isArray(team.invitations) ? team.invitations : []).map((invitation) => value(invitation as Row, "status") ?? ""))).map((team) => asTeamOption(team));
}

export async function getPeopleDetailActionContext(detail: PeopleDetail, mode: "admin" | "campus_lead" = "admin"): Promise<PeopleDetailActionContext> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const currentProfileId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  const [campusesResult, counselorResult, coachResult, currentResult, selfTeamResult, couplesResult, coupleInvitationsResult, campusLeadsResult, coupleReadinessResult, coupleReadinessInvitationsResult, coachAssignmentResult] = await Promise.all([
    supabase.from("campuses").select("id,name,active").order("name"),
    supabase.from("groups").select(`id,name,group_type,active,campus:campuses(id,name),group_members(ended_at,profile:profiles(${readinessProfileSelection})),invitations(status)`).eq("group_type", "counselor_team").eq("active", true).order("name"),
    supabase.from("groups").select(`id,name,group_type,active,campus:campuses(id,name),group_members(ended_at,profile:profiles(${readinessProfileSelection})),invitations(status)`).eq("group_type", "coach_team").eq("active", true).order("name"),
    detail.kind !== "group"
      ? Promise.resolve({ data: null, error: null })
      : detail.type === "couples"
        ? supabase.from("counseling_cases").select("case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,name,group_type,active,campus:campuses(name)),assigned_profile:profiles!case_assignments_assigned_profile_id_fkey(id,first_name,last_name,email,campus:campuses(name)))").eq("couple_group_id", detail.id).maybeSingle()
        : detail.type === "counselors"
          ? supabase.from("supervision_assignments").select("ended_at,coach_group:groups!supervision_assignments_coach_group_id_fkey(id,name,group_type,active,campus:campuses(name))").eq("counselor_group_id", detail.id).is("ended_at", null).maybeSingle()
          : detail.type === "coaches"
            ? supabase.from("supervision_assignments").select("ended_at,counselor_group:groups!supervision_assignments_counselor_group_id_fkey(id,name,group_type,active,campus:campuses(name))").eq("coach_group_id", detail.id).is("ended_at", null)
            : detail.type === "campus_leads"
              ? (supabase as unknown as { from: (table: "campus_lead_coach_assignments") => { select: (columns: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => Promise<{ data: Row[] | null; error: { message: string } | null }> } } } }).from("campus_lead_coach_assignments").select("ended_at,coach_group:groups!campus_lead_coach_assignments_coach_group_id_fkey(id,name,group_type,active,campus:campuses(id,name))").eq("campus_lead_group_id", detail.id).is("ended_at", null)
            : Promise.resolve({ data: null, error: null }),
    mode === "campus_lead" && currentProfileId ? supabase.from("groups").select(`id,name,group_type,active,campus:campuses(id,name),group_members!inner(profile_id,ended_at,profile:profiles(${readinessProfileSelection})),invitations(status)`).eq("group_type", "campus_lead_team" as "couple").eq("active", true).eq("group_members.profile_id", currentProfileId).is("group_members.ended_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
    detail.kind === "group" && ["coaches", "counselors", "campus_leads"].includes(detail.type) ? supabase.from("groups").select(`id,name,group_members(ended_at,profile:profiles(${readinessProfileSelection})),counseling_cases(case_assignments(assignment_type,assigned_group_id,ended_at))`).eq("group_type", "couple").eq("active", true).order("name") : Promise.resolve({ data: [], error: null }),
    detail.kind === "group" && ["coaches", "counselors", "campus_leads"].includes(detail.type) ? (supabase as unknown as { from: (table: "invitations") => { select: (columns: string) => Promise<{ data: Array<{ group_id: string; status: string }> | null; error: { message: string } | null }> } }).from("invitations").select("group_id,status") : Promise.resolve({ data: [], error: null }),
    detail.kind === "group" && ["couples", "counselors"].includes(detail.type) ? supabase.from("groups").select(`id,name,group_type,active,campus:campuses(id,name),group_members(ended_at,profile:profiles(id,${readinessProfileSelection},profile_roles!profile_roles_profile_id_fkey(role),campus_lead_assignments!campus_lead_assignments_profile_id_fkey(campus_id,ended_at))),invitations(status)`).eq("group_type", "campus_lead_team" as "couple").eq("active", true).order("name") : Promise.resolve({ data: [], error: null }),
    detail.kind === "group" && detail.type === "couples" ? supabase.from("groups").select(`group_members(ended_at,profile:profiles(${readinessProfileSelection}))`).eq("id", detail.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    detail.kind === "group" && detail.type === "couples" ? (supabase as unknown as { from: (table: "invitations") => { select: (columns: string) => { eq: (column: string, value: string) => Promise<{ data: Array<{ status: string }> | null; error: { message: string } | null }> } } }).from("invitations").select("status").eq("group_id", detail.id) : Promise.resolve({ data: [], error: null }),
    detail.kind === "group" && detail.type === "campus_leads"
      ? (supabase as unknown as { from: (table: "campus_lead_coach_assignments") => { select: (columns: string) => { is: (column: string, value: null) => Promise<{ data: Row[] | null; error: { message: string } | null }> } } }).from("campus_lead_coach_assignments").select("coach_group_id").is("ended_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (campusesResult.error || counselorResult.error || coachResult.error || currentResult.error || selfTeamResult.error || couplesResult.error || coupleInvitationsResult.error || campusLeadsResult.error || coupleReadinessResult.error || coupleReadinessInvitationsResult.error || coachAssignmentResult.error) {
    throw new Error("People detail actions are unavailable");
  }

  const currentRow = currentResult.data as Row | Row[] | null;
  const selfTeam = selfTeamResult.data as unknown as Row | null;
  const coupleReadiness = coupleReadinessResult.data as unknown as Row | null;
  const assignments = !Array.isArray(currentRow) && Array.isArray(currentRow?.case_assignments) ? currentRow.case_assignments as Row[] : [];
  const currentCoupleAssignment = assignments.find((assignment) => assignment.ended_at === null && assignment.assignment_type === "counselor");
  const currentCounselorAssignment = assignments.find((assignment) => assignment.ended_at === null && assignment.assignment_type === "counselor");
  const currentCounselorTeams = detail.kind === "group" && detail.type === "coaches" ? counselorTeamsFromSupervisionRows(Array.isArray(currentRow) ? currentRow : []) : [];
  const currentCampusLeadCoaches = detail.kind === "group" && detail.type === "campus_leads" ? (Array.isArray(currentRow) ? currentRow : []).map((assignment) => asTeamOption(assignment.coach_group as Row)) : [];
  const activeCoachAssignmentIds = ((coachAssignmentResult.data ?? []) as Row[]).map((assignment) => value(assignment, "coach_group_id")).filter(Boolean) as string[];

  const coupleCandidates = (couplesResult.data ?? []).map((couple) => {
    const members = (couple.group_members as unknown as Row[] | null) ?? [];
    const activeMemberNames = members.filter((member) => member.ended_at === null).map((member) => { const profile = member.profile as Row | null; return { firstName: value(profile, "first_name"), lastName: value(profile, "last_name"), email: value(profile, "email") }; });
    const resolvedName = coupleDisplayName(couple.name, activeMemberNames, []);
    const counselingCase = Array.isArray(couple.counseling_cases) ? couple.counseling_cases[0] : couple.counseling_cases;
    return { ...couple, name: resolvedName, case_assignments: (counselingCase as Row | null)?.case_assignments, invitations: (coupleInvitationsResult.data ?? []).filter((invitation) => invitation.group_id === couple.id) };
  });
  const finalEligibleCouples = detail.kind === "group" && ["coaches", "counselors", "campus_leads"].includes(detail.type) ? eligibleUnassignedCounselorCoupleOptions(coupleCandidates) : eligibleCoupleOptions(coupleCandidates);

  const counselorTeams = readyTeamOptions((counselorResult.data ?? []) as unknown as Row[]);
  const coachTeams = readyTeamOptions((coachResult.data ?? []) as unknown as Row[]);
  const campusLeadTargets = mode === "admin" ? readyTeamOptions((campusLeadsResult.data ?? []) as unknown as Row[]) : [];
  const selfTarget = mode === "campus_lead" && selfTeam && isOperationalTeamReady(rows(selfTeam.group_members) as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, rows(selfTeam.invitations).map((invitation) => value(invitation, "status") ?? "")) ? asTeamOption(selfTeam) : null;
  const eligibleCounselingTeams = eligibleCoupleAssignmentTeams({ counselorTeams, coachTeams, campusLeadTargets, selfTarget });

  return {
    mode,
    selfTarget,
    campusLeadTargets,
    eligibleCouples: finalEligibleCouples,
    campuses: (campusesResult.data ?? []).map((campus) => ({ id: campus.id, name: campus.name, active: campus.active })),
    counselorTeams,
    coachTeams,
    eligibleCounselingTeams,
    campusLeadCoachTeams: detail.kind === "group" && detail.type === "campus_leads" ? eligibleCampusLeadCoachTeams(coachTeams, detail.campusId, activeCoachAssignmentIds) : [],
    currentCounselorTeam: currentCounselorAssignment ? asTeamOption(currentCounselorAssignment.assigned_group as Row) : null,
    currentCoachTeam: !Array.isArray(currentRow) && currentRow?.coach_group ? asTeamOption(currentRow.coach_group as Row) : null,
    currentCounselorTeams,
    currentCampusLeadCoaches,
    currentCoupleTeam: currentCoupleAssignment?.assigned_group ? { ...asTeamOption(currentCoupleAssignment.assigned_group as Row), type: currentCoupleAssignment.assignment_type === "campus_lead" ? "campus_lead" : currentCoupleAssignment.assignment_type as "coach" | "counselor" } : null,
    currentCoupleAssignmentType: currentCoupleAssignment?.assignment_type === "coach" || currentCoupleAssignment?.assignment_type === "counselor" ? currentCoupleAssignment.assignment_type : null,
    coupleCampusId: detail.kind === "group" && detail.type === "couples" ? detail.campusId : null,
    coupleAssignmentReady: detail.kind === "group" && detail.type === "couples" && Boolean(coupleReadiness) ? isAssignmentReadyCouple(rows(coupleReadiness!.group_members) as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, (coupleReadinessInvitationsResult.data ?? []).map((invitation) => invitation.status)) : false,
  };
}
