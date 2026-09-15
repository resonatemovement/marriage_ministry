import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";

import {
  groupOperationalStatuses,
  createPendingDetailMember,
  groupRecordType,
  createDetailMember,
  standaloneProfileRecordType,
  type GroupPeopleDetail,
  type PeopleDetail,
  type PeopleDetailMember,
  type ProfilePeopleDetail,
} from "./detail-model";
import { coupleDisplayName, intakeCoupleDisplayName } from "./types";

type Row = Record<string, unknown>;

function value(row: Row | null | undefined, key: string) {
  if (!row) return null;
  return typeof row[key] === "string" ? row[key] : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? value as Row[] : [];
}

async function asMember(profile: Row, invitationId?: string): Promise<PeopleDetailMember> {
  const status = value(profile, "status");
  const roles = rows(profile.profile_roles)
    .map((role) => value(role, "role"))
    .filter((role): role is string => Boolean(role));

  return createDetailMember({
    id: value(profile, "id")!,
    firstName: value(profile, "first_name"),
    lastName: value(profile, "last_name"),
    email: value(profile, "email"),
    phone: value(profile, "phone"),
    campusId: value(profile, "campus_id"),
    photoPath: value(profile, "photo_path"),
    photoUrl: await getProfilePhotoUrl(value(profile, "photo_path")),
    roles,
    status: status === "invited" || status === "password_required" || status === "onboarding" || status === "deactivated" ? status : "active",
    onboardingCompletedAt: value(profile, "onboarding_completed_at"),
    invitationId,
  });
}

export async function getPeopleDetail(recordId: string): Promise<PeopleDetail | null> {
  const supabase = await createServerSupabaseClient();
  const [groupResult, profileResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id,name,group_type,updated_at,campus:campuses(id,name),intake_requests(id,status,submitted_at,intake_request_people(person_position,first_name,last_name)),group_members(ended_at,profile:profiles(id,first_name,last_name,email,phone,campus_id,photo_path,status,onboarding_completed_at,profile_roles!profile_roles_profile_id_fkey(role)))")
      .eq("id", recordId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id,first_name,last_name,email,phone,photo_path,status,onboarding_completed_at,updated_at,campus:campuses(id,name),profile_roles!profile_roles_profile_id_fkey(role)")
      .eq("id", recordId)
      .maybeSingle(),
  ]);

  if (groupResult.error || profileResult.error) {
    throw new Error("People detail data is unavailable");
  }

  if (groupResult.data) {
    return getGroupDetail(supabase, groupResult.data as unknown as Row);
  }

  if (!profileResult.data) return null;

  const profile = profileResult.data as unknown as Row;
  const invitationClient = supabase as unknown as { from(name: "invitations"): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> } } } };
  const invitationResult = await invitationClient.from("invitations").select("id,status").eq("auth_user_id", value(profile, "id")!).maybeSingle();
  if (invitationResult.error) throw new Error("People detail data is unavailable");
  const member = await asMember(profile, value(invitationResult.data, "id") ?? undefined);
  const type = standaloneProfileRecordType(member.roles);
  if (!type) return null;
  const campus = profile.campus as Row | null;

  return {
    kind: "profile",
    id: value(profile, "id")!,
    type,
    name: member.name,
    campusId: campus ? value(campus, "id") : null,
    campus: campus ? value(campus, "name") : null,
    updatedAt: value(profile, "updated_at")!,
    member,
  } satisfies ProfilePeopleDetail;
}

async function getGroupDetail(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, group: Row): Promise<GroupPeopleDetail | null> {
  const type = groupRecordType(value(group, "group_type"));
  if (!type) return null;

  const groupId = value(group, "id")!;
  const invitationClient = supabase as unknown as { from(name: "invitations"): { select(columns: string): { eq(column: string, value: string): Promise<{ data: unknown; error: { message: string } | null }> } } };
  const invitationResult = await invitationClient.from("invitations").select("id,auth_user_id,first_name,last_name,email,status,last_delivery_succeeded_at,delivery_error_category").eq("group_id", groupId);
  if (invitationResult.error) throw new Error("People detail data is unavailable");
  const invitations = rows(invitationResult.data);
  const invitationByProfileId = new Map(invitations.map((invitation) => [value(invitation, "auth_user_id"), value(invitation, "id")]));
  const profileMembers = rows(group.group_members)
    .filter((membership) => membership.ended_at === null && membership.profile)
    .map((membership) => { const profile = membership.profile as Row; return asMember(profile, invitationByProfileId.get(value(profile, "id")) ?? undefined); });
  const resolvedProfileMembers = await Promise.all(profileMembers);
  const pendingMembers = invitations.filter((invitation) => value(invitation, "status") === "pending").map((invitation) => createPendingDetailMember({ id: value(invitation, "id")!, firstName: value(invitation, "first_name"), lastName: value(invitation, "last_name"), email: value(invitation, "email"), delivered: Boolean(value(invitation, "last_delivery_succeeded_at")), failed: Boolean(value(invitation, "delivery_error_category")) }));
  const members = [...resolvedProfileMembers, ...pendingMembers];
  const [caseResult, assignmentResult, supervisionResult] = await Promise.all([
    type === "couples"
      ? supabase.from("counseling_cases").select("id,status,case_assignments(ended_at,assignment_type,assigned_group:groups!case_assignments_assigned_group_id_fkey(name,group_type),assigned_profile:profiles!case_assignments_assigned_profile_id_fkey(first_name,last_name,email))").eq("couple_group_id", groupId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    type === "couples"
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("case_assignments").select("id,started_at,counseling_case:counseling_cases(status,couple_group:groups!counseling_cases_couple_group_id_fkey(id,name,campus:campuses(name),group_members(ended_at,profile:profiles(first_name,last_name,email))))").eq("assigned_group_id", groupId).eq("assignment_type", "counselor" as "coach").is("ended_at", null),
    type === "coaches"
      ? supabase.from("supervision_assignments").select("id,counselor_group:groups!supervision_assignments_counselor_group_id_fkey(name)").eq("coach_group_id", groupId).is("ended_at", null)
      : type === "counselors"
        ? supabase.from("supervision_assignments").select("id,coach_group:groups!supervision_assignments_coach_group_id_fkey(name)").eq("counselor_group_id", groupId).is("ended_at", null)
        : Promise.resolve({ data: [], error: null }),
  ]);

  if (caseResult.error || assignmentResult.error || supervisionResult.error) {
    throw new Error("People detail data is unavailable");
  }

  const groupCase = caseResult.data as unknown as Row | null;
  const caseAssignments = rows(groupCase?.case_assignments).filter((assignment) => assignment.ended_at === null);
  const teamAssignments = (assignmentResult.data ?? []) as unknown as Row[];
  const supervision = (supervisionResult.data ?? []) as unknown as Row[];
  const activeAssignmentCount = type === "couples" ? caseAssignments.length : teamAssignments.length;
  const hasCounselorAssignment = caseAssignments.some((assignment) => value(assignment, "assignment_type") === "counselor");
  const teamNames = type === "couples"
    ? caseAssignments.map((assignment) => { const group = value(assignment.assigned_group as Row, "name"); if (group) return group; const profile = assignment.assigned_profile as Row | null; const name = [value(profile, "first_name"), value(profile, "last_name")].filter(Boolean).join(" ") || value(profile, "email"); return name ? `${name} · Campus Lead` : null; }).filter(Boolean) as string[]
    : teamAssignments.map((assignment) => value((assignment.counseling_case as Row)?.couple_group as Row, "name")).filter(Boolean) as string[];
  const directAssignmentName = (assignmentType: "coach" | "counselor" | "campus_lead") => caseAssignments.filter((assignment) => value(assignment, "assignment_type") === assignmentType).map((assignment) => value(assignment.assigned_group as Row, "name")).find(Boolean) ?? null;
  const coachAssignment = type === "couples" ? directAssignmentName("coach") : null;
  const counselorAssignment = type === "couples" ? caseAssignments.filter((assignment) => value(assignment, "assignment_type") === "counselor").map((assignment) => value(assignment.assigned_group as Row, "name")).find(Boolean) ?? null : null;
  const campusLeadAssignment = type === "couples" ? directAssignmentName("campus_lead") : null;
  const supervisedNames = supervision.map((assignment) => value((assignment.counselor_group ?? assignment.coach_group) as Row, "name")).filter(Boolean) as string[];
  const assignedCouples = type === "coaches" || type === "counselors" || type === "campus_leads" ? teamAssignments.map((assignment) => { const counselingCase = assignment.counseling_case as Row | null; const couple = counselingCase?.couple_group as Row | null; const campus = couple?.campus as Row | null; const coupleMembers = rows(couple?.group_members).filter((member) => member.ended_at === null).map((member) => { const profile = member.profile as Row | null; return { firstName: value(profile, "first_name"), lastName: value(profile, "last_name"), email: value(profile, "email") }; }); return { id: value(couple, "id")!, name: coupleDisplayName(value(couple, "name"), coupleMembers, []), campus: value(campus, "name"), status: value(counselingCase, "status") as GroupPeopleDetail["counselingStatus"], assignedAt: value(assignment, "started_at") }; }).filter((couple) => couple.id) : [];
  const campus = group.campus as Row | null;
  const intake = group.intake_requests as Row | null;
  const intakeName = intakeCoupleDisplayName(rows(intake?.intake_request_people).map((person) => ({ firstName: value(person, "first_name"), lastName: value(person, "last_name"), position: value(person, "person_position") })));

  return {
    kind: "group",
    id: groupId,
    type,
    name: type === "couples"
      ? coupleDisplayName(value(group, "name"), resolvedProfileMembers.map((member) => ({ firstName: member.firstName, lastName: member.lastName, email: member.email })), pendingMembers.map((member) => ({ firstName: member.firstName, lastName: member.lastName, email: member.email })), intakeName)
      : value(group, "name")!,
    campusId: campus ? value(campus, "id") : null,
    campus: campus ? value(campus, "name") : null,
    updatedAt: value(group, "updated_at")!,
    members,
    counselingStatus: groupCase ? value(groupCase, "status") as GroupPeopleDetail["counselingStatus"] : null,
    activeAssignmentCount,
    assignmentSummary: teamNames.length ? teamNames.join(", ") : "No active assignments",
    coachAssignment,
    counselorAssignment,
    campusLeadAssignment,
    supervisionSummary: supervisedNames.length ? supervisedNames.join(", ") : type === "couples" ? "Not applicable" : type === "coaches" ? "No Counselors Assigned" : "No Coach Assigned",
    operationalStatuses: groupOperationalStatuses({ type, members, activeAssignmentCount, hasCounselorAssignment, supervisionCount: supervision.length }),
    assignedCouples,
    intakeOrigin: intake && type === "couples" ? { id: value(intake, "id")!, name: intakeName, status: value(intake, "status")!, submittedAt: value(intake, "submitted_at") } : null,
  };
}
