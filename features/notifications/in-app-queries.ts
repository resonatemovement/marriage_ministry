import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InAppNotification } from "./in-app-notification-menu";

export async function getInAppNotifications(recipientProfileId: string): Promise<InAppNotification[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("in_app_notifications")
    .select("id,notification_type,title,message,case_session_id,created_at,read_at")
    .eq("recipient_profile_id", recipientProfileId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    console.error("In-app notifications could not be loaded.", { code: error.code });
    return [];
  }
  return data ?? [];
}
