"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveCounselorAssessmentPreference(assessmentId: string, sessionId: string) {
  await requireOneOfRoles(["counselor"], "/workspace");
  if (!UUID.test(assessmentId) || !UUID.test(sessionId)) return { error: "Select a valid published Session." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_assessment_counselor_preference", { target_assessment_id: assessmentId, target_session_id: sessionId });
  if (error) return { error: "Assessment preference could not be saved." };
  revalidatePath("/workspace");
  return { success: true };
}

export async function saveCaseAssessmentSchedule(caseId: string, assessmentId: string, versionId: string, sessionId: string | null) {
  await requireOneOfRoles(["counselor", "admin", "super_admin"], `/workspace/cases/${caseId}`);
  if (!UUID.test(caseId) || !UUID.test(assessmentId) || !UUID.test(versionId) || (sessionId !== null && !UUID.test(sessionId))) {
    return { error: "Select a valid published Assessment and Session." };
  }
  const supabase = await createServerSupabaseClient();
  const args = {
    target_case_id: caseId,
    target_assessment_id: assessmentId,
    target_version_id: versionId,
    ...(sessionId ? { target_session_id: sessionId } : {}),
  };
  const { error } = await supabase.rpc("configure_case_assessment_schedule", args);
  if (error) return { error: "Assessment schedule could not be saved. Confirm the selected Session is not already completed." };
  revalidatePath(`/workspace/cases/${caseId}`);
  return { success: true };
}

export async function rescheduleCaseAssessment(caseId: string, assessmentId: string, sessionId: string) {
  await requireOneOfRoles(["counselor", "admin", "super_admin"], `/workspace/cases/${caseId}`);
  if (!UUID.test(caseId) || !UUID.test(assessmentId) || !UUID.test(sessionId)) return { error: "Select a valid published Session." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("reschedule_case_assessment_schedule", {
    target_case_id: caseId,
    target_assessment_id: assessmentId,
    target_session_id: sessionId,
  });
  if (error) return { error: "Assessment schedule could not be changed. Confirm the selected Session is not already completed." };
  revalidatePath(`/workspace/cases/${caseId}`);
  return { success: true };
}
