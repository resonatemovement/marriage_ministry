"use server";

import { revalidatePath } from "next/cache";
import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CARE_ROLES = ["campus_lead", "coach", "counselor"] as const;
function required(formData: FormData, name: string) { const value = formData.get(name); return typeof value === "string" && value.trim() ? value.trim() : null; }

export async function scheduleCounselingMeeting(formData: FormData) {
  await requireOneOfRoles(CARE_ROLES, "/workspace");
  const caseId = required(formData, "caseId"); const sessionId = required(formData, "sessionId"); const date = required(formData, "date"); const start = required(formData, "startTime"); const end = required(formData, "endTime"); const location = required(formData, "location");
  if (!caseId || !date || !start || !end || !location) return { error: "Date, start time, end time, and location are required." };
  const startsAt = new Date(`${date}T${start}`).toISOString(); const endsAt = new Date(`${date}T${end}`).toISOString();
  if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) return { error: "Enter a valid meeting time." };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("schedule_case_session_meeting" as never, { target_case_id: caseId, target_session_id: sessionId || null, target_starts_at: startsAt, target_ends_at: endsAt, target_location: location } as never);
  if (error) return { error: error.message };
  revalidatePath("/workspace"); return { success: true };
}

export async function closeCounselingCase(formData: FormData) {
  await requireOneOfRoles(CARE_ROLES, "/workspace");
  const caseId = required(formData, "caseId"); if (!caseId) return { error: "Counseling case is unavailable." };
  const supabase = await createServerSupabaseClient(); const { error } = await supabase.rpc("close_counseling_case" as never, { target_case_id: caseId } as never);
  if (error) return { error: error.message }; revalidatePath("/workspace"); return { success: true };
}
