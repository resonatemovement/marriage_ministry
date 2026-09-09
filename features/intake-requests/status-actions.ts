"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { canManuallyTransitionIntakeRequest, isIntakeRequestStatus } from "./model";

type ActionResult = { success: true } | { error: string };
type IntakeStatusRpc = { rpc: (name: "update_intake_request_status", args: { target_request_id: string; next_status: string }) => Promise<{ error: { message: string } | null }> };

export async function updateIntakeRequestStatus(formData: FormData): Promise<ActionResult> {
  await requireWorkspace("admin", "/intake-requests");
  const requestId = String(formData.get("requestId") ?? ""); const current = String(formData.get("currentStatus") ?? ""); const next = String(formData.get("nextStatus") ?? "");
  if (!requestId || !isIntakeRequestStatus(current) || !isIntakeRequestStatus(next) || !canManuallyTransitionIntakeRequest(current, next)) return { error: "Choose a valid next status." };
  const supabase = await createServerSupabaseClient(); const { error } = await (supabase as unknown as IntakeStatusRpc).rpc("update_intake_request_status", { target_request_id: requestId, next_status: next });
  if (error) return { error: "Unable to update this request. Please try again." };
  revalidatePath("/intake-requests"); revalidatePath(`/intake-requests/${requestId}`);
  return { success: true };
}
