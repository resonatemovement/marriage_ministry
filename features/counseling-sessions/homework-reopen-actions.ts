"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function reopenParticipantHomework(caseId: string, progressId: string) {
  await requireOneOfRoles(["counselor", "admin", "super_admin"], "/workspace");
  if (!caseId || !progressId) return { success: false };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("reopen_participant_homework", {
    target_case_id: caseId,
    target_progress_id: progressId,
  });
  if (error) return { success: false };

  revalidatePath(`/workspace/cases/${caseId}`);
  revalidatePath(`/workspace/cases/${caseId}/homework/${progressId}`);
  revalidatePath("/workspace");
  revalidatePath("/workspace/sessions/[caseSessionId]", "page");
  return { success: true };
}
