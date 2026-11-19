"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type HomeworkNotificationRecoveryState = { success?: boolean; error?: string };
type RecoveryClient = { rpc(name: "request_homework_completion_recipient_recovery", args: { target_delivery_id: string }): Promise<{ data: unknown; error: { message: string } | null }> };

export async function requestHomeworkNotificationRecovery(_previous: HomeworkNotificationRecoveryState, formData: FormData): Promise<HomeworkNotificationRecoveryState> {
  await requireOneOfRoles(["admin", "super_admin"], "/dashboard/attention");
  const deliveryId = formData.get("deliveryId");
  if (typeof deliveryId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryId)) return { error: "This recipient delivery is unavailable for recovery." };
  const client = await createServerSupabaseClient() as unknown as RecoveryClient;
  const { data, error } = await client.rpc("request_homework_completion_recipient_recovery", { target_delivery_id: deliveryId });
  if (error || data !== true) return { error: "Recovery is unavailable. Confirm the delivery outcome and correct recipient eligibility before trying again." };
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/attention");
  return { success: true };
}
