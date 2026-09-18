"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfWorkspaces, requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { isAssignmentReadyCouple } from "./detail-actions-model";

type ActionResult = { error: string } | { success: true };
type AssignmentType = "counselor" | "coach";
type ManagedGroupType = "couple" | "coach_team" | "counselor_team" | "campus_lead_team";

interface EnsureCaseRpcClient {
  rpc(functionName: "ensure_and_assign_counseling_case", args: { target_couple_group_id: string; target_group_id: string | null; target_profile_id: string | null; target_assignment_type: "campus_lead" | AssignmentType; reassignment_reason?: string }): Promise<{ data: string | null; error: { message: string } | null }>;
}

interface UnassignCaseRpcClient {
  rpc(functionName: "unassign_counseling_case", args: { target_couple_group_id: string; unassignment_reason?: string }): Promise<{ data: boolean | null; error: { message: string } | null }>;
}

async function ensureAndAssign(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, coupleGroupId: string, groupId: string | null, profileId: string | null, assignmentType: "campus_lead" | AssignmentType, reason?: string) {
  return (supabase as unknown as EnsureCaseRpcClient).rpc("ensure_and_assign_counseling_case", { target_couple_group_id: coupleGroupId, target_group_id: groupId, target_profile_id: profileId, target_assignment_type: assignmentType, reassignment_reason: reason });
}

interface SupervisionRpcClient {
  rpc(
    functionName: "assign_counselor_coach_supervision",
    args: { target_counselor_group_id: string; target_coach_group_id: string },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
}
interface CampusLeadCoachRpcClient { rpc(functionName: "assign_campus_lead_coach", args: { target_campus_lead_group_id: string; target_coach_group_id: string }): Promise<{ data: string | null; error: { message: string } | null }>; }
interface OperationalUnassignRpcClient {
  rpc(functionName: "unassign_campus_lead_coach", args: { target_campus_lead_group_id: string; target_coach_group_id: string }): Promise<{ data: boolean | null; error: { message: string } | null }>;
  rpc(functionName: "unassign_counselor_coach_supervision", args: { target_counselor_group_id: string }): Promise<{ data: boolean | null; error: { message: string } | null }>;
}

function formValue(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function invalid(message: string): ActionResult {
  return { error: message };
}

function safeMutationError() {
  return invalid("The change could not be saved. Please try again.");
}

async function authorize(recordId: string) {
  await requireWorkspace("admin", `/people/${recordId}`);
  return createServerSupabaseClient();
}

async function activeTeam(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, groupId: string, groupType: ManagedGroupType) {
  const { data, error } = await supabase.from("groups").select("id").eq("id", groupId).eq("group_type", groupType as "couple").eq("active", true).maybeSingle();
  if (error || !data) return null;
  return data;
}

async function activeCampus(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, campusId: string) {
  if (!campusId) return true;
  const { data, error } = await supabase.from("campuses").select("id").eq("id", campusId).eq("active", true).maybeSingle();
  return !error && Boolean(data);
}

export async function updatePeopleDetail(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const name = formValue(formData, "name");
  const campusId = formValue(formData, "campusId");
  if (!recordId || !name || name.length > 120) return invalid("Enter a name of up to 120 characters.");

  const supabase = await authorize(recordId);
  const groupResult = await supabase.from("groups").select("id,campus_id,group_type").eq("id", recordId).maybeSingle();
  if (groupResult.error) return safeMutationError();
  if (groupResult.data) {
    if (!(["couple", "coach_team", "counselor_team", "campus_lead_team"] as const).includes(groupResult.data.group_type as ManagedGroupType)) return invalid("This record cannot be edited here.");
    if (campusId !== groupResult.data.campus_id && !await activeCampus(supabase, campusId)) return invalid("Choose an active campus.");
    const { error } = await supabase.from("groups").update({ name, campus_id: campusId || null }).eq("id", recordId);
    if (error) return safeMutationError();
  } else {
    const firstName = formValue(formData, "firstName");
    const lastName = formValue(formData, "lastName");
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) return invalid("Enter a first and last name of up to 80 characters each.");
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id,campus_id,profile_roles!profile_roles_profile_id_fkey(role)").eq("id", recordId).maybeSingle();
    if (profileError) return safeMutationError();
    const roles = profile?.profile_roles.map((role) => role.role) ?? [];
    if (!profile || !roles.some((role) => role === "admin" || role === "super_admin" || role === "author")) return invalid("This record cannot be edited here.");
    if (campusId !== profile.campus_id && !await activeCampus(supabase, campusId)) return invalid("Choose an active campus.");
    const { error } = await supabase.from("profiles").update({ first_name: firstName, last_name: lastName, campus_id: campusId || null }).eq("id", recordId);
    if (error) return safeMutationError();
  }

  revalidatePath(`/people/${recordId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function assignCounselor(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const counselorGroupId = formValue(formData, "targetGroupId");
  if (!recordId || !counselorGroupId) return invalid("Choose a Counselor team.");

  const supabase = await authorize(recordId);
  if (!await activeTeam(supabase, recordId, "couple") || !await activeTeam(supabase, counselorGroupId, "counselor_team")) {
    return invalid("Choose a Counselor team.");
  }

  const { error } = await ensureAndAssign(supabase, recordId, counselorGroupId, null, "counselor");
  if (error) return safeMutationError();

  revalidatePath(`/people/${recordId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function assignCoupleTeam(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const targetValue = formValue(formData, "targetGroupId");
  if (!recordId || !targetValue) return invalid("Choose an eligible person or team.");
  const [targetKind, targetId] = targetValue.split(":", 2);
  if (!targetId || targetKind !== "group") return invalid("Choose an eligible team.");

  const supabase = await authorize(recordId);
  if (!await activeTeam(supabase, recordId, "couple")) return invalid("Choose an active Couple.");
  const { data: target, error: targetError } = await supabase.from("groups").select("id,group_type").eq("id", targetId).eq("active", true).in("group_type", ["campus_lead_team" as "couple", "coach_team", "counselor_team"]).maybeSingle();
  if (targetError || !target) return invalid("Choose an active care team.");
  const { error } = await ensureAndAssign(supabase, recordId, targetId, null, "counselor");
  if (error) return safeMutationError();
  revalidatePath(`/people/${recordId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function unassignCounselorOfRecord(formData: FormData): Promise<ActionResult> {
  const coupleGroupId = formValue(formData, "coupleGroupId") || formValue(formData, "recordId");
  const providerGroupId = formValue(formData, "providerGroupId");
  if (!coupleGroupId) return invalid("Choose an active Couple.");

  const supabase = await authorize(coupleGroupId);
  if (!await activeTeam(supabase, coupleGroupId, "couple")) return invalid("Choose an active Couple.");
  if (providerGroupId) {
    const { data: counselingCase, error: caseError } = await supabase.from("counseling_cases").select("case_assignments(assigned_group_id,assignment_type,ended_at)").eq("couple_group_id", coupleGroupId).maybeSingle();
    const hasProviderAssignment = counselingCase?.case_assignments.some((assignment) => assignment.assigned_group_id === providerGroupId && assignment.assignment_type === "counselor" && assignment.ended_at === null);
    if (caseError || !hasProviderAssignment) return invalid("This Couple is no longer assigned to this team.");
  }
  const { data, error } = await (supabase as unknown as UnassignCaseRpcClient).rpc("unassign_counseling_case", {
    target_couple_group_id: coupleGroupId,
  });
  if (error || !data) {
    console.error("Counselor-of-record unassignment failed.", { coupleGroupId, providerGroupId: providerGroupId || null, error: error?.message ?? "No active Counselor-of-record assignment" });
    return safeMutationError();
  }

  revalidatePath(`/people/${coupleGroupId}`);
  if (providerGroupId) revalidatePath(`/people/${providerGroupId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function assignCoupleToCounselorOfRecord(formData: FormData): Promise<ActionResult> {
  const coupleGroupId = formValue(formData, "coupleGroupId");
  const teamGroupId = formValue(formData, "teamGroupId");
  if (!coupleGroupId || !teamGroupId) return invalid("Choose a Couple.");
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], `/people/${teamGroupId}`);
  const supabase = await createServerSupabaseClient();
  const { data: target } = await supabase.from("groups").select("id,group_type,campus_id").eq("id", teamGroupId).eq("active", true).in("group_type", ["counselor_team", "coach_team", "campus_lead_team" as "counselor_team"]).maybeSingle();
  if (!target) return invalid("Choose an eligible counseling team.");
  const { data: couple } = await supabase.from("groups").select("id,group_type,campus_id,group_members(ended_at,profile:profiles(status,onboarding_completed_at,first_name,last_name,email,campus_id,phone,photo_path))").eq("id", coupleGroupId).eq("group_type", "couple").eq("active", true).maybeSingle();
  const invitationClient = supabase as unknown as { from: (table: "invitations") => { select: (columns: string) => { eq: (column: string, value: string) => Promise<{ data: Array<{ status: string }> | null; error: { message: string } | null }> } } };
  const { data: invitations } = await invitationClient.from("invitations").select("status").eq("group_id", coupleGroupId);
  if (!couple || !isAssignmentReadyCouple(couple.group_members as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, (invitations ?? []).map((invitation) => invitation.status)) || (identity.workspaces.includes("campus_lead") && !identity.workspaces.includes("admin") && couple.campus_id !== target.campus_id)) return invalid("Choose an eligible same-campus Couple.");
  const { error } = await ensureAndAssign(supabase, coupleGroupId, teamGroupId, null, "counselor");
  if (error) return safeMutationError();
  revalidatePath(`/people/${teamGroupId}`); revalidatePath(`/people/${coupleGroupId}`); revalidatePath("/people"); return { success: true };
}

export async function assignCoupleToCoachTeam(formData: FormData): Promise<ActionResult> {
  const coupleGroupId = formValue(formData, "coupleGroupId");
  const coachGroupId = formValue(formData, "coachGroupId");
  if (!coupleGroupId || !coachGroupId) return invalid("Choose a Couple.");
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], `/people/${coachGroupId}`);
  const supabase = await createServerSupabaseClient();
  const { data: target } = await supabase.from("groups").select("id,group_type,campus_id").eq("id", coachGroupId).eq("group_type", "coach_team").eq("active", true).maybeSingle();
  if (!target) return invalid("Choose a Coach team.");
  const { data: couple } = await supabase.from("groups").select("id,group_type,campus_id,group_members(ended_at,profile:profiles(status,onboarding_completed_at,first_name,last_name,email,campus_id,phone,photo_path))").eq("id", coupleGroupId).eq("group_type", "couple").eq("active", true).maybeSingle();
  const invitationClient = supabase as unknown as { from: (table: "invitations") => { select: (columns: string) => { eq: (column: string, value: string) => Promise<{ data: Array<{ status: string }> | null; error: { message: string } | null }> } } };
  const { data: invitations } = await invitationClient.from("invitations").select("status").eq("group_id", coupleGroupId);
  const invitationStatuses = (invitations ?? []).map((invitation) => invitation.status);
  if (!couple || !isAssignmentReadyCouple(couple.group_members as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, invitationStatuses) || (identity.workspaces.includes("campus_lead") && !identity.workspaces.includes("admin") && couple.campus_id !== target.campus_id)) return invalid("Choose an eligible same-campus Couple.");
  const { error } = await ensureAndAssign(supabase, coupleGroupId, coachGroupId, null, "coach");
  if (error) return safeMutationError();
  revalidatePath(`/people/${coachGroupId}`); revalidatePath(`/people/${coupleGroupId}`); revalidatePath("/people"); return { success: true };
}

export async function assignCoupleToCounselorTeam(formData: FormData): Promise<ActionResult> {
  const coupleGroupId = formValue(formData, "coupleGroupId");
  const counselorGroupId = formValue(formData, "counselorGroupId");
  if (!coupleGroupId || !counselorGroupId) return invalid("Choose a Couple.");
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], `/people/${counselorGroupId}`);
  const supabase = await createServerSupabaseClient();
  const { data: target } = await supabase.from("groups").select("id,group_type,campus_id").eq("id", counselorGroupId).eq("group_type", "counselor_team").eq("active", true).maybeSingle();
  if (!target) return invalid("Choose a Counselor team.");
  const { data: couple } = await supabase.from("groups").select("id,group_type,campus_id,group_members(ended_at,profile:profiles(status,onboarding_completed_at,first_name,last_name,email,campus_id,phone,photo_path))").eq("id", coupleGroupId).eq("group_type", "couple").eq("active", true).maybeSingle();
  const invitationClient = supabase as unknown as { from: (table: "invitations") => { select: (columns: string) => { eq: (column: string, value: string) => Promise<{ data: Array<{ status: string }> | null; error: { message: string } | null }> } } };
  const { data: invitations } = await invitationClient.from("invitations").select("status").eq("group_id", coupleGroupId);
  const invitationStatuses = (invitations ?? []).map((invitation) => invitation.status);
  if (!couple || !isAssignmentReadyCouple(couple.group_members as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, invitationStatuses) || (identity.workspaces.includes("campus_lead") && !identity.workspaces.includes("admin") && couple.campus_id !== target.campus_id)) return invalid("Choose an eligible same-campus Couple.");
  const { error } = await ensureAndAssign(supabase, coupleGroupId, counselorGroupId, null, "counselor");
  if (error) return safeMutationError();
  revalidatePath(`/people/${counselorGroupId}`); revalidatePath(`/people/${coupleGroupId}`); revalidatePath("/people"); return { success: true };
}

export async function assignCoupleToCampusLeadTeam(formData: FormData): Promise<ActionResult> {
  const coupleGroupId = formValue(formData, "coupleGroupId");
  const campusLeadGroupId = formValue(formData, "campusLeadGroupId");
  if (!coupleGroupId || !campusLeadGroupId) return invalid("Choose a Couple.");
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], `/people/${campusLeadGroupId}`);
  const supabase = await createServerSupabaseClient();
  const { data: target } = await supabase.from("groups").select("id,group_type,campus_id").eq("id", campusLeadGroupId).eq("group_type", "campus_lead_team" as "couple").eq("active", true).maybeSingle();
  if (!target) return invalid("Choose a Campus Lead team.");
  const { data: couple } = await supabase.from("groups").select("id,group_type,campus_id,group_members(ended_at,profile:profiles(status,onboarding_completed_at,first_name,last_name,email,campus_id,phone,photo_path))").eq("id", coupleGroupId).eq("group_type", "couple").eq("active", true).maybeSingle();
  const invitationClient = supabase as unknown as { from: (table: "invitations") => { select: (columns: string) => { eq: (column: string, value: string) => Promise<{ data: Array<{ status: string }> | null; error: { message: string } | null }> } } };
  const { data: invitations } = await invitationClient.from("invitations").select("status").eq("group_id", coupleGroupId);
  const invitationStatuses = (invitations ?? []).map((invitation) => invitation.status);
  if (!couple || !isAssignmentReadyCouple(couple.group_members as Array<{ ended_at?: string | null; profile?: { status?: string | null; onboarding_completed_at?: string | null } | null }>, invitationStatuses) || (identity.workspaces.includes("campus_lead") && !identity.workspaces.includes("admin") && couple.campus_id !== target.campus_id)) return invalid("Choose an eligible same-campus Couple.");
  const { error } = await ensureAndAssign(supabase, coupleGroupId, campusLeadGroupId, null, "campus_lead");
  if (error) return safeMutationError();
  revalidatePath(`/people/${campusLeadGroupId}`); revalidatePath(`/people/${coupleGroupId}`); revalidatePath("/people"); return { success: true };
}

export async function assignCoupleAsCampusLead(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const targetValue = formValue(formData, "targetGroupId");
  const targetGroupId = targetValue.startsWith("group:") ? targetValue.slice("group:".length) : "";
  if (!recordId) return invalid("Choose an active Couple.");
  await requireOneOfWorkspaces(["campus_lead"], `/people/${recordId}`);
  const supabase = await createServerSupabaseClient();
  if (targetGroupId) {
    const { data: target } = await supabase.from("groups").select("group_type").eq("id", targetGroupId).maybeSingle();
    const targetGroupType = target?.group_type as string | undefined;
    if (!target || (targetGroupType !== "campus_lead_team" && targetGroupType !== "coach_team" && targetGroupType !== "counselor_team")) return invalid("Choose an available assignment target.");
    const assignmentType = targetGroupType === "campus_lead_team" ? "campus_lead" : targetGroupType === "coach_team" ? "coach" : "counselor";
    const { error } = await ensureAndAssign(supabase, recordId, targetGroupId, null, assignmentType);
    if (error) return safeMutationError();
  } else {
    const { error } = await ensureAndAssign(supabase, recordId, null, null, "campus_lead");
    if (error) return safeMutationError();
  }
  revalidatePath(`/people/${recordId}`); revalidatePath("/people"); return { success: true };
}

export async function assignCoach(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const coachGroupId = formValue(formData, "targetGroupId");
  if (!recordId || !coachGroupId) return invalid("Choose a Coach team.");

  const supabase = await authorize(recordId);
  const [recordResult, targetResult] = await Promise.all([
    supabase.from("groups").select("id,group_type,active,campus_id").eq("id", recordId).maybeSingle(),
    supabase.from("groups").select("id,group_type,active,campus_id").eq("id", coachGroupId).maybeSingle(),
  ]);
  const record = recordResult.data;
  const target = targetResult.data;
  const recordValid = !recordResult.error && record?.group_type === "counselor_team" && record.active;
  const targetValid = !targetResult.error && target?.group_type === "coach_team" && target.active;
  if (!recordValid || !targetValid) {
    return invalid("Choose a Coach team.");
  }

  // The current CLI omits this DEV RPC from generated types; keep the narrow cast at its sole call site.
  const supervisionClient = supabase as unknown as SupervisionRpcClient;
  const { error } = await supervisionClient.rpc("assign_counselor_coach_supervision", {
    target_counselor_group_id: recordId,
    target_coach_group_id: coachGroupId,
  });
  if (error) return safeMutationError();

  revalidatePath(`/people/${recordId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function assignCoachToCampusLead(formData: FormData): Promise<ActionResult> {
  const campusLeadGroupId = formValue(formData, "recordId");
  const coachGroupId = formValue(formData, "targetGroupId");
  if (!campusLeadGroupId || !coachGroupId) return invalid("Choose a Coach team.");
  await requireOneOfWorkspaces(["admin", "campus_lead"], `/people/${campusLeadGroupId}`);
  const supabase = await createServerSupabaseClient();
  if (!await activeTeam(supabase, campusLeadGroupId, "campus_lead_team") || !await activeTeam(supabase, coachGroupId, "coach_team")) return invalid("Choose a Coach team.");
  const { error } = await (supabase as unknown as CampusLeadCoachRpcClient).rpc("assign_campus_lead_coach", { target_campus_lead_group_id: campusLeadGroupId, target_coach_group_id: coachGroupId });
  if (error) return safeMutationError();
  revalidatePath(`/people/${campusLeadGroupId}`); revalidatePath(`/people/${coachGroupId}`); revalidatePath("/people"); return { success: true };
}

export async function unassignCoachFromCampusLead(formData: FormData): Promise<ActionResult> {
  const campusLeadGroupId = formValue(formData, "campusLeadGroupId");
  const coachGroupId = formValue(formData, "coachGroupId");
  if (!campusLeadGroupId || !coachGroupId) return invalid("Choose an assigned Coach team.");
  const supabase = await authorize(campusLeadGroupId);
  const { error } = await (supabase as unknown as OperationalUnassignRpcClient).rpc("unassign_campus_lead_coach", { target_campus_lead_group_id: campusLeadGroupId, target_coach_group_id: coachGroupId });
  if (error) return safeMutationError();
  revalidatePath(`/people/${campusLeadGroupId}`); revalidatePath(`/people/${coachGroupId}`); revalidatePath("/people");
  return { success: true };
}

export async function assignCounselorToCoach(formData: FormData): Promise<ActionResult> {
  const coachGroupId = formValue(formData, "recordId");
  const counselorGroupId = formValue(formData, "targetGroupId");
  if (!coachGroupId || !counselorGroupId) return invalid("Choose a Counselor team.");

  const supabase = await authorize(coachGroupId);
  if (!await activeTeam(supabase, coachGroupId, "coach_team") || !await activeTeam(supabase, counselorGroupId, "counselor_team")) {
    return invalid("Choose a Counselor team.");
  }

  const supervisionClient = supabase as unknown as SupervisionRpcClient;
  const { error } = await supervisionClient.rpc("assign_counselor_coach_supervision", {
    target_counselor_group_id: counselorGroupId,
    target_coach_group_id: coachGroupId,
  });
  if (error) return safeMutationError();

  revalidatePath(`/people/${coachGroupId}`);
  revalidatePath(`/people/${counselorGroupId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function unassignCounselorFromCoach(formData: FormData): Promise<ActionResult> {
  const coachGroupId = formValue(formData, "coachGroupId");
  const counselorGroupId = formValue(formData, "counselorGroupId");
  if (!coachGroupId || !counselorGroupId) return invalid("Choose an assigned Counselor team.");
  const supabase = await authorize(coachGroupId);
  const { error } = await (supabase as unknown as OperationalUnassignRpcClient).rpc("unassign_counselor_coach_supervision", { target_counselor_group_id: counselorGroupId });
  if (error) return safeMutationError();
  revalidatePath(`/people/${coachGroupId}`); revalidatePath(`/people/${counselorGroupId}`); revalidatePath("/people");
  return { success: true };
}
