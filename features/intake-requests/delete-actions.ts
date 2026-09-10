"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Result = { success: true } | { error: string };

export async function deleteIntakeRequest(requestId: string): Promise<Result> {
  const identity = await requireWorkspace("admin", "/intake-requests");
  if (!identity.roles.includes("super_admin")) return { error: "Only Super Admins may permanently delete Intake Requests." };
  if (!requestId) return { error: "This Intake Request is no longer available." };
  const client = await createServerSupabaseClient();
  const { error } = await client.rpc("delete_intake_request" as never, { target_request_id: requestId } as never);
  if (error) {
    if (error.message.includes("invitations have already been created") || error.message.includes("participant records")) return { error: "This request can’t be permanently deleted because participant records have already been created. Preserve the participant history instead." };
    return { error: "Unable to delete this Intake Request. Please try again." };
  }
  revalidatePath("/intake-requests");
  revalidatePath(`/intake-requests/${requestId}`);
  return { success: true };
}
