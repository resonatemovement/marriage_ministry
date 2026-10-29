"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = { success: false as const, error: "This Assessment could not be saved. Please try again." };

export async function startCoupleAssessment(assignmentId: string) {
  if (!uuidPattern.test(assignmentId)) return { ...unavailable, attemptId: null };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("start_assessment_attempt", { target_participant_assignment_id: assignmentId, voluntary_retake: false });
  if (error || !data) return { ...unavailable, attemptId: null };
  revalidatePath("/workspace/assessments");
  revalidatePath("/workspace");
  return { success: true as const, error: null, attemptId: data };
}

export async function saveCoupleAssessmentResponse(input: { attemptId: string; questionId: string; choiceId: string }) {
  if (![input.attemptId, input.questionId, input.choiceId].every((value) => uuidPattern.test(value))) return unavailable;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("save_assessment_response", {
    target_attempt_id: input.attemptId, target_question_id: input.questionId, target_choice_id: input.choiceId,
  });
  if (error) return unavailable;
  revalidatePath("/workspace/assessments");
  revalidatePath("/workspace");
  return { success: true as const, error: null };
}

export async function submitCoupleAssessment(attemptId: string) {
  if (!uuidPattern.test(attemptId)) return unavailable;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("submit_assessment_attempt", { target_attempt_id: attemptId });
  if (error || !data?.length) return unavailable;
  revalidatePath("/workspace/assessments");
  revalidatePath("/workspace/assessments/[assignmentId]", "page");
  revalidatePath("/workspace");
  return { success: true as const, error: null };
}
