"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | { success: true };
type AssignmentType = "counselor" | "coach";
type ManagedGroupType = "couple" | "coach_team" | "counselor_team";

interface SupervisionRpcClient {
  rpc(
    functionName: "assign_counselor_coach_supervision",
    args: { target_counselor_group_id: string; target_coach_group_id: string },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
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
  const { data, error } = await supabase.from("groups").select("id").eq("id", groupId).eq("group_type", groupType).eq("active", true).maybeSingle();
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
    if (!(["couple", "coach_team", "counselor_team"] as const).includes(groupResult.data.group_type)) return invalid("This record cannot be edited here.");
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
    return invalid("Choose an active Counselor team.");
  }

  const { data: counselingCase, error: caseError } = await supabase
    .from("counseling_cases")
    .select("id,case_assignments(ended_at,assignment_type,assigned_group_id)")
    .eq("couple_group_id", recordId)
    .maybeSingle();
  if (caseError) return safeMutationError();
  if (!counselingCase) return invalid("This Couple does not have a counseling case yet.");

  const currentAssignment = (counselingCase.case_assignments ?? []).find((assignment) => assignment.ended_at === null && assignment.assignment_type === "counselor");
  if (currentAssignment?.assigned_group_id === counselorGroupId) return { success: true };

  const { error } = await supabase.rpc("assign_counseling_case", {
    target_case_id: counselingCase.id,
    target_group_id: counselorGroupId,
    target_assignment_type: "counselor" as AssignmentType,
  });
  if (error) return safeMutationError();

  revalidatePath(`/people/${recordId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function assignCoupleTeam(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const targetGroupId = formValue(formData, "targetGroupId");
  if (!recordId || !targetGroupId) return invalid("Choose a team.");

  const supabase = await authorize(recordId);
  if (!await activeTeam(supabase, recordId, "couple")) return invalid("Choose an active Couple.");
  const { data: target, error: targetError } = await supabase.from("groups").select("id,group_type").eq("id", targetGroupId).eq("active", true).in("group_type", ["coach_team", "counselor_team"]).maybeSingle();
  if (targetError || !target) return invalid("Choose an active Coach or Counselor team.");

  const { data: counselingCase, error: caseError } = await supabase.from("counseling_cases").select("id,case_assignments(ended_at,assigned_group_id)").eq("couple_group_id", recordId).maybeSingle();
  if (caseError) return safeMutationError();
  if (!counselingCase) return invalid("This Couple does not have a counseling case yet.");
  const currentAssignment = (counselingCase.case_assignments ?? []).find((assignment) => assignment.ended_at === null);
  if (currentAssignment?.assigned_group_id === targetGroupId) return { success: true };

  const { error } = await supabase.rpc("assign_counseling_case", {
    target_case_id: counselingCase.id,
    target_group_id: targetGroupId,
    target_assignment_type: target.group_type === "coach_team" ? "coach" : "counselor",
  });
  if (error) return safeMutationError();
  revalidatePath(`/people/${recordId}`);
  revalidatePath("/people");
  return { success: true };
}

export async function assignCoach(formData: FormData): Promise<ActionResult> {
  const recordId = formValue(formData, "recordId");
  const coachGroupId = formValue(formData, "targetGroupId");
  if (!recordId || !coachGroupId) return invalid("Choose a Coach team.");

  const supabase = await authorize(recordId);
  if (!await activeTeam(supabase, recordId, "counselor_team") || !await activeTeam(supabase, coachGroupId, "coach_team")) {
    return invalid("Choose an active Coach team.");
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
