import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import { canReadAdminDashboard } from "@/features/dashboard/data";
import { orderCouplePartners } from "./partner-order";

import { coupleDisplayName, groupedRoleNames, intakeCoupleDisplayName, matchesCoupleListStatus, matchesPeopleFilter, type CoupleListStatus, type PeopleFilter, type PeopleRecord, type PeopleRecordType } from "./types";
import { peopleGroupSelection, peopleProfileSelection } from "./selections";
import { groupOperationalStatuses, operationalStatusLabel } from "./detail-model";
import { counselingStatusLabel, type CaseStatus } from "@/lib/counseling/domain";
import { activeTeamAssignmentCounts, assignedCoupleAssignmentType } from "./team-assignment";

type QueryResult = { records: PeopleRecord[]; error?: "unauthorized" | "unavailable" };
type GroupRow = Record<string, unknown>;
type ProfileRow = Record<string, unknown>;
type GroupPeopleRecord = PeopleRecord & {
  active: boolean;
  unassigned: boolean;
  caseStatus: CaseStatus | null;
  orderedPartnerProfiles: { id: string; firstName: string | null; lastName: string | null; gender: "male" | "female" | null; photoPath: string | null }[];
};

function value(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

const caseStatusLabels: Record<string, string> = {
  requested: "Requested", assessment: "Assessment", interviewed: "Interviewed", matched: "Matched",
  active: "In Progress", pending_final: "Final Review", finished: "Completed", referred: "Referred", inactive: "Closed — Incomplete",
};

function publicPeopleGroup(record: GroupPeopleRecord): PeopleRecord {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    roles: record.roles,
    campus: record.campus,
    status: record.status,
    assignedTo: record.assignedTo,
    updatedAt: record.updatedAt,
    searchText: record.searchText,
  };
}

export async function getPeopleRecords(filter: PeopleFilter, search: string, coupleListStatus?: CoupleListStatus | null): Promise<QueryResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { records: [], error: "unauthorized" };
  const profileId = claims.claims.sub;
  if (coupleListStatus) {
    if (typeof profileId !== "string") return { records: [], error: "unauthorized" };
    const [{ data: roleRows, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.from("profile_roles").select("role").eq("profile_id", profileId),
      supabase.from("profiles").select("status").eq("id", profileId).maybeSingle(),
    ]);
    if (roleError || profileError) return { records: [], error: "unavailable" };
    if (profile?.status !== "active" || !canReadAdminDashboard(roleRows?.map(({ role }) => role) ?? [])) return { records: [], error: "unauthorized" };
  }

  const [groupsResult, profilesResult, teamAssignmentsResult, supervisionResult, campusLeadAssignmentsResult, counselingCasesResult] = await Promise.all([
    supabase.from("groups").select(peopleGroupSelection).in("group_type", ["couple", "coach_team", "counselor_team", "campus_lead_team" as "couple"]),
    supabase.from("profiles").select(peopleProfileSelection),
    supabase.from("case_assignments").select("assigned_group_id,assignment_type,ended_at").in("assignment_type", ["coach", "counselor"]).is("ended_at", null),
    supabase.from("supervision_assignments").select("coach_group_id,counselor_group_id").is("ended_at", null),
    (supabase as unknown as { from: (table: "campus_lead_coach_assignments") => { select: (columns: string) => { is: (column: string, value: null) => Promise<{ data: GroupRow[] | null; error: { message: string } | null }> } } }).from("campus_lead_coach_assignments").select("campus_lead_group_id,coach_group_id").is("ended_at", null),
    supabase.from("counseling_cases").select("couple_group_id,status,case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(id,name,group_type))"),
  ]);
  if (groupsResult.error || profilesResult.error || teamAssignmentsResult.error || supervisionResult.error || campusLeadAssignmentsResult.error || counselingCasesResult.error) return { records: [], error: "unavailable" };

  const assignedCoupleCounts = activeTeamAssignmentCounts(teamAssignmentsResult.data ?? []);
  const supervisingCoachByCounselor = new Map<string, string>();
  const supervisedCounselorCounts = new Map<string, number>();
  (supervisionResult.data ?? []).forEach((assignment) => { if (assignment.coach_group_id && assignment.counselor_group_id) { supervisingCoachByCounselor.set(assignment.counselor_group_id, assignment.coach_group_id); supervisedCounselorCounts.set(assignment.coach_group_id, (supervisedCounselorCounts.get(assignment.coach_group_id) ?? 0) + 1); } });
  const campusLeadByCoach = new Map<string, string>();
  (campusLeadAssignmentsResult.data ?? []).forEach((assignment) => campusLeadByCoach.set(value(assignment, "coach_group_id")!, value(assignment, "campus_lead_group_id")!));
  const casesByCouple = new Map((counselingCasesResult.data ?? []).map((counselingCase) => [counselingCase.couple_group_id, counselingCase as unknown as GroupRow]));

  const groupedMemberIds = new Set<string>();
  const groups: GroupPeopleRecord[] = (groupsResult.data as unknown as GroupRow[]).map((group) => {
    const members = rows(group.group_members).filter((member) => member.ended_at === null).map((member) => member.profile as Record<string, unknown>).filter(Boolean);
    const invitations = rows(group.invitations).filter((invitation) => invitation.status === "pending");
    members.forEach((member) => { const id = value(member, "id"); if (id) groupedMemberIds.add(id); });
    const groupType = value(group, "group_type") as "couple" | "coach_team" | "counselor_team" | "campus_lead_team";
    const counselingCase = casesByCouple.get(value(group, "id")!) ?? rows(group.counseling_cases)[0];
    const activeAssignments = rows(counselingCase?.case_assignments).filter((assignment) => assignment.ended_at === null);
    const counselorAssignment = activeAssignments.find((assignment) => value(assignment, "assignment_type") === "counselor");
    const campus = group.campus as Record<string, unknown> | null;
    const type = groupType === "coach_team" ? "coaches" : groupType === "counselor_team" ? "counselors" : groupType === "campus_lead_team" ? "campus_leads" : "couples";
    const assignedCoupleType = assignedCoupleAssignmentType(type);
    const intake = group.intake_requests as GroupRow | null;
    const intakePeople = rows(intake?.intake_request_people);
    const intakeGenderByEmail = new Map(intakePeople.map((person) => [value(person, "email")?.toLowerCase(), value(person, "gender")]));
    const intakeName = intakeCoupleDisplayName(intakePeople.map((person) => ({ firstName: value(person, "first_name"), lastName: value(person, "last_name"), position: value(person, "person_position"), gender: value(person, "gender") as "male" | "female" | null })));
    const orderedPartnerProfiles = orderCouplePartners(members.map((member) => ({
      id: value(member, "id")!,
      firstName: value(member, "first_name"),
      lastName: value(member, "last_name"),
      gender: value(member, "gender") as "male" | "female" | null,
      photoPath: value(member, "photo_path"),
    })));
    const name = type === "couples"
      ? coupleDisplayName(value(group, "name"), members.map((member) => ({ firstName: value(member, "first_name"), lastName: value(member, "last_name"), email: value(member, "email"), gender: value(member, "gender") as "male" | "female" | null })), invitations.map((invitation) => ({ firstName: value(invitation, "first_name"), lastName: value(invitation, "last_name"), email: value(invitation, "email"), gender: intakeGenderByEmail.get(value(invitation, "email")?.toLowerCase()) as "male" | "female" | null | undefined })), intakeName)
      : value(group, "name")!;
    const statuses = groupOperationalStatuses({
      type,
      members: [...members.map((member) => ({ accountStatus: value(member, "status") === "active" ? "Active" as const : "Invitation Sent" as const })), ...invitations.map(() => ({ accountStatus: "Invitation Sent" as const, pending: true }))],
      activeAssignmentCount: assignedCoupleType ? assignedCoupleCounts.get(value(group, "id")!)?.[assignedCoupleType] ?? 0 : 0,
      hasCounselorAssignment: activeAssignments.some((assignment) => value(assignment, "assignment_type") === "counselor"),
      supervisionCount: type === "coaches" ? supervisedCounselorCounts.get(value(group, "id")!) ?? 0 : type === "counselors" && supervisingCoachByCounselor.has(value(group, "id")!) ? 1 : 0,
    });
    return {
      id: value(group, "id")!, name, type,
      roles: groupedRoleNames(members, invitations), campus: campus ? value(campus, "name") : null,
      status: type === "couples" ? counselingStatusLabel(counselingCase ? value(counselingCase, "status") as PeopleRecord["status"] : null, Boolean(counselorAssignment), statuses[0]?.label !== "Partner Setup Incomplete" && statuses[0]?.label !== "Invitations Pending" && statuses[0]?.label !== "Waiting on Second Member") : operationalStatusLabel(statuses),
      caseStatus: type === "couples" ? value(counselingCase ?? {}, "status") as CaseStatus | null : null,
      unassigned: type === "couples" && !counselorAssignment,
      active: group.active === true,
      orderedPartnerProfiles,
      assignedTo: type === "couples" ? (counselorAssignment?.assigned_group ? value(counselorAssignment.assigned_group as Record<string, unknown>, "name") : null) : type === "coaches" ? groupsResult.data?.find((candidate) => candidate.id === campusLeadByCoach.get(value(group, "id")!))?.name ?? null : type === "counselors" ? groupsResult.data?.find((candidate) => candidate.id === supervisingCoachByCounselor.get(value(group, "id")!))?.name ?? null : null,
      updatedAt: value(group, "updated_at")!, searchText: [name, value(group, "name"), intakeName, ...members.flatMap((member) => [value(member, "first_name"), value(member, "last_name"), value(member, "email")])].filter(Boolean).join(" ").toLowerCase(),
    };
  });
  const profiles = (profilesResult.data as unknown as ProfileRow[]).filter((profile) => !groupedMemberIds.has(value(profile, "id")!)).map((profile) => {
    const roles = rows(profile.profile_roles).map((role) => value(role, "role")).filter((role): role is string => Boolean(role));
    const type: PeopleRecordType = roles.includes("admin") || roles.includes("super_admin") ? "admins" : roles.includes("campus_lead") ? "campus_leads" : "authors";
    const campus = profile.campus as Record<string, unknown> | null;
    const name = [value(profile, "first_name"), value(profile, "last_name")].filter(Boolean).join(" ") || value(profile, "email")!;
    return { id: value(profile, "id")!, name, type, roles, campus: campus ? value(campus, "name") : null, status: null, assignedTo: null, updatedAt: value(profile, "updated_at")!, searchText: [name, value(profile, "email"), campus ? value(campus, "name") : null].filter(Boolean).join(" ").toLowerCase(), inactive: value(profile, "status") === "deactivated" } satisfies PeopleRecord;
  }).filter((profile) => profile.roles.includes("admin") || profile.roles.includes("super_admin") || profile.roles.includes("author"));
  const normalizedSearch = search.trim().toLowerCase();
  if (!coupleListStatus) {
    const visibleGroups = groups.map(publicPeopleGroup);
    const records: PeopleRecord[] = [...visibleGroups, ...profiles]
      .filter((record) => matchesPeopleFilter(record, filter) && (!normalizedSearch || record.searchText.includes(normalizedSearch)));
    return { records: records.sort((a, b) => a.name.localeCompare(b.name)) };
  }

  const coupleRecords = groups.filter((record) => matchesPeopleFilter(record, filter) && (!normalizedSearch || record.searchText.includes(normalizedSearch)) && matchesCoupleListStatus(record, coupleListStatus));
  return { records: await Promise.all(coupleRecords.map(async (record) => {
    const { orderedPartnerProfiles, ...publicRecord } = record;
    const status = record.unassigned
      ? record.caseStatus ? `Unassigned · ${caseStatusLabels[record.caseStatus] ?? record.caseStatus}` : "Unassigned · No Case"
      : record.caseStatus ? caseStatusLabels[record.caseStatus] ?? record.caseStatus : "No Case";
    return {
      ...publicRecord,
      status,
      couplePartners: await Promise.all(orderedPartnerProfiles.map(async (partner) => ({
        id: partner.id,
        name: [partner.firstName, partner.lastName].filter(Boolean).join(" ") || "Partner",
        photoUrl: await getProfilePhotoUrl(partner.photoPath),
      }))),
    };
  })).then((couples) => couples.sort((a, b) => a.name.localeCompare(b.name))) };
}
