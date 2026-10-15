"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ParticipantHomeworkIntent = "save" | "submit";
type ParticipantHomeworkActionInput = {
  progressId: string;
  answers: Record<string, string>;
  intent: ParticipantHomeworkIntent;
};
type ParticipantHomeworkActionResult = {
  success: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  status: "not_started" | "in_progress" | "submitted" | "reviewed" | null;
};

export async function persistParticipantHomework(input: ParticipantHomeworkActionInput): Promise<ParticipantHomeworkActionResult> {
  const progressId = input.progressId.trim();
  const answersAreValid = input.answers && typeof input.answers === "object"
    && Object.entries(input.answers).every(([blockId, answer]) => blockId.trim() && typeof answer === "string");
  if (!progressId || !answersAreValid || !["save", "submit"].includes(input.intent)) {
    return { success: false, error: "Homework assignment is unavailable.", fieldErrors: {}, status: null };
  }

  const fieldErrors = input.intent === "submit"
    ? Object.fromEntries(Object.entries(input.answers).filter(([, answer]) => !answer.trim()).map(([blockId]) => [blockId, "A response is required."]))
    : {};
  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, error: "Please complete each required response before submitting.", fieldErrors, status: null };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("persist_participant_homework", {
    target_progress_id: progressId,
    target_answers: input.answers,
    target_intent: input.intent,
  });
  if (error) {
    const readOnly = error.message.includes("read-only");
    const incomplete = error.message.includes("meaningful answer");
    return {
      success: false,
      error: readOnly ? "Submitted Homework is read-only." : incomplete ? "Please complete each required response before submitting." : input.intent === "save" ? "Your draft could not be saved." : "Homework could not be submitted.",
      fieldErrors: {},
      status: null,
    };
  }
  revalidatePath("/workspace/homework");
  revalidatePath("/workspace/sessions/[caseSessionId]", "page");
  revalidatePath("/workspace");
  return { success: true, error: null, fieldErrors: {}, status: data };
}
