import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { coupleDisplayName, groupedRoleNames, intakeCoupleDisplayName, matchesPeopleFilter, type PeopleFilter, type PeopleRecord, type PeopleRecordType } from "./types";
import { peopleGroupSelection, peopleProfileSelection } from "./selections";
import { groupOperationalStatuses, operationalStatusLabel } from "./detail-model";
import { counselingStatusLabel } from "@/lib/counseling/domain";

type QueryResult = { records: PeopleRecord[]; error?: "unauthorized" | "unavailable" };
type GroupRow = Record<string, unknown>;
type ProfileRow = Record<string, unknown>;

function value(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export async function getPeopleRecords(filter: PeopleFilter, search: string): Promise<QueryResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { records: [], error: "unauthorized" };

  const [groupsResult, profilesResult, teamAssignmentsResult, supervisionResult, campusLeadAssignmentsResult, counselingCasesResult] = await Promise.all([
    supabase.from("groups").select(peopleGroupSelection).in("group_type", ["couple", "coach_team", "counselor_team", "campus_lead_team" as "couple"]),
    supabase.from("profiles").select(peopleProfileSelection),
    supabase.from("case_assignments").select("assigned_group_id").eq("assignment_type", "counselor" as "coach").is("ended_at", null),
    supabase.from("supervision_assignments").select("coach_group_id,counselor_group_id").is("ended_at", null),
    (supabase as unknown as { from: (table: "campus_lead_coach_assignments") => { select: (columns: string) => { is: (column: string, value: null) => Promise<{ data: GroupRow[] | null; error: { message: string } | null }> } } }).from("campus_lead_coach_assignments").select("campus_lead_group_id,coach_group_id").is("ended_at", null),
    supabase.from("counseling_cases").select("couple_group_id,status,case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,name,group_type))"),
  ]);
  if (groupsResult.error || profilesResult.error || teamAssignmentsResult.error || supervisionResult.error || campusLeadAssignmentsResult.error || counselingCasesResult.error) return { records: [], error: "unavailable" };

  const assignedCoupleCounts = new Map<string, number>();
  (teamAssignmentsResult.data ?? []).forEach((assignment) => { if (assignment.assigned_group_id) assignedCoupleCounts.set(assignment.assigned_group_id, (assignedCoupleCounts.get(assignment.assigned_group_id) ?? 0) + 1); });
  const supervisingCoachByCounselor = new Map<string, string>();
  const supervisedCounselorCounts = new Map<string, number>();
  (supervisionResult.data ?? []).forEach((assignment) => { if (assignment.coach_group_id && assignment.counselor_group_id) { supervisingCoachByCounselor.set(assignment.counselor_group_id, assignment.coach_group_id); supervisedCounselorCounts.set(assignment.coach_group_id, (supervisedCounselorCounts.get(assignment.coach_group_id) ?? 0) + 1); } });
  const campusLeadByCoach = new Map<string, string>();
  (campusLeadAssignmentsResult.data ?? []).forEach((assignment) => campusLeadByCoach.set(value(assignment, "coach_group_id")!, value(assignment, "campus_lead_group_id")!));
  const casesByCouple = new Map((counselingCasesResult.data ?? []).map((counselingCase) => [counselingCase.couple_group_id, counselingCase as unknown as GroupRow]));

  const groupedMemberIds = new Set<string>();
  const groups = (groupsResult.data as unknown as GroupRow[]).map((group) => {
    const members = rows(group.group_members).filter((member) => member.ended_at === null).map((member) => member.profile as Record<string, unknown>).filter(Boolean);
    const invitations = rows(group.invitations).filter((invitation) => invitation.status === "pending");
    members.forEach((member) => { const id = value(member, "id"); if (id) groupedMemberIds.add(id); });
    const groupType = value(group, "group_type") as "couple" | "coach_team" | "counselor_team" | "campus_lead_team";
    const counselingCase = casesByCouple.get(value(group, "id")!) ?? rows(group.counseling_cases)[0];
    const activeAssignments = rows(counselingCase?.case_assignments).filter((assignment) => assignment.ended_at === null);
    const counselorAssignment = activeAssignments.find((assignment) => value(assignment, "assignment_type") === "counselor");
    const campus = group.campus as Record<string, unknown> | null;
    const type = groupType === "coach_team" ? "coaches" : groupType === "counselor_team" ? "counselors" : groupType === "campus_lead_team" ? "campus_leads" : "couples";
    const intake = group.intake_requests as GroupRow | null;
    const intakeName = intakeCoupleDisplayName(rows(intake?.intake_request_people).map((person) => ({ firstName: value(person, "first_name"), lastName: value(person, "last_name"), position: value(person, "person_position") })));
    const name = type === "couples"
      ? coupleDisplayName(value(group, "name"), members.map((member) => ({ firstName: value(member, "first_name"), lastName: value(member, "last_name"), email: value(member, "email") })), invitations.map((invitation) => ({ firstName: value(invitation, "first_name"), lastName: value(invitation, "last_name"), email: value(invitation, "email") })), intakeName)
      : value(group, "name")!;
    const statuses = groupOperationalStatuses({
      type,
      members: [...members.map((member) => ({ accountStatus: value(member, "status") === "active" ? "Active" as const : "Invitation Sent" as const })), ...invitations.map(() => ({ accountStatus: "Invitation Sent" as const, pending: true }))],
      activeAssignmentCount: assignedCoupleCounts.get(value(group, "id")!) ?? 0,
      hasCounselorAssignment: activeAssignments.some((assignment) => value(assignment, "assignment_type") === "counselor"),
      supervisionCount: type === "coaches" ? supervisedCounselorCounts.get(value(group, "id")!) ?? 0 : type === "counselors" && supervisingCoachByCounselor.has(value(group, "id")!) ? 1 : 0,
    });
    return {
      id: value(group, "id")!, name, type,
      roles: groupedRoleNames(members, invitations), campus: campus ? value(campus, "name") : null,
      status: type === "couples" ? counselingStatusLabel(counselingCase ? value(counselingCase, "status") as PeopleRecord["status"] : null, Boolean(counselorAssignment), statuses[0]?.label !== "Partner Setup Incomplete" && statuses[0]?.label !== "Invitations Pending" && statuses[0]?.label !== "Waiting on Second Member") : operationalStatusLabel(statuses),
      assignedTo: type === "couples" ? (counselorAssignment?.assigned_group ? value(counselorAssignment.assigned_group as Record<string, unknown>, "name") : null) : type === "coaches" ? groupsResult.data?.find((candidate) => candidate.id === campusLeadByCoach.get(value(group, "id")!))?.name ?? null : type === "counselors" ? groupsResult.data?.find((candidate) => candidate.id === supervisingCoachByCounselor.get(value(group, "id")!))?.name ?? null : null,
      updatedAt: value(group, "updated_at")!, searchText: [name, value(group, "name"), intakeName, ...members.flatMap((member) => [value(member, "first_name"), value(member, "last_name"), value(member, "email")])].filter(Boolean).join(" ").toLowerCase(),
    } satisfies PeopleRecord;
  });
  const profiles = (profilesResult.data as unknown as ProfileRow[]).filter((profile) => !groupedMemberIds.has(value(profile, "id")!)).map((profile) => {
    const roles = rows(profile.profile_roles).map((role) => value(role, "role")).filter((role): role is string => Boolean(role));
    const type: PeopleRecordType = roles.includes("admin") || roles.includes("super_admin") ? "admins" : roles.includes("campus_lead") ? "campus_leads" : "authors";
    const campus = profile.campus as Record<string, unknown> | null;
    const name = [value(profile, "first_name"), value(profile, "last_name")].filter(Boolean).join(" ") || value(profile, "email")!;
    return { id: value(profile, "id")!, name, type, roles, campus: campus ? value(campus, "name") : null, status: null, assignedTo: null, updatedAt: value(profile, "updated_at")!, searchText: [name, value(profile, "email"), campus ? value(campus, "name") : null].filter(Boolean).join(" ").toLowerCase(), inactive: value(profile, "status") === "deactivated" } satisfies PeopleRecord;
  }).filter((profile) => profile.roles.includes("admin") || profile.roles.includes("super_admin") || profile.roles.includes("author"));
  const normalizedSearch = search.trim().toLowerCase();
  return { records: [...groups, ...profiles].filter((record) => matchesPeopleFilter(record, filter) && (!normalizedSearch || record.searchText.includes(normalizedSearch))).sort((a, b) => a.name.localeCompare(b.name)) };
}
