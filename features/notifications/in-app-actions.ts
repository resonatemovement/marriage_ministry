"use server";

import { revalidatePath } from "next/cache";

import { requireOneOfRoles } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function markInAppNotificationRead(notificationId: string) {
  await requireOneOfRoles(["couple"], "/workspace");
  if (!notificationId) return { success: false };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("mark_in_app_notification_read", { target_notification_id: notificationId });
  if (error) return { success: false };
  revalidatePath("/workspace");
  return { success: data === true };
}
