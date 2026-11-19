import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type HomeworkNotificationAlert = {
  id: string;
  deliveryId: string | null;
  caseId: string;
  caseSessionId: string;
  recipientName: string | null;
  status: "failed" | "uncertain" | "blocked";
  statusCode: string | null;
  cycle: number;
  createdAt: string;
  sessionTitle: string;
  sessionNumber: number;
};

type RawClient = { rpc(name: "list_homework_completion_recipient_delivery_alerts", args: { target_limit: number }): Promise<{ data: unknown; error: { message: string } | null }> };
const object = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};

export async function getHomeworkCompletionNotificationAlerts(roles: readonly string[]): Promise<{ alerts: HomeworkNotificationAlert[]; error: boolean }> {
  if (!roles.includes("admin") && !roles.includes("super_admin")) return { alerts: [], error: false };
  const client = await createServerSupabaseClient() as unknown as RawClient;
  const { data, error } = await client.rpc("list_homework_completion_recipient_delivery_alerts", { target_limit: 50 });
  if (error || !Array.isArray(data)) return { alerts: [], error: true };
  const alerts = data.flatMap((value) => {
    const row = object(value);
    if ((row.delivery_id !== null && typeof row.delivery_id !== "string") || typeof row.notification_id !== "string"
      || typeof row.counseling_case_id !== "string" || typeof row.case_session_id !== "string"
      || (row.recipient_name !== null && typeof row.recipient_name !== "string") || !["failed", "uncertain", "blocked"].includes(String(row.status))
      || typeof row.completion_cycle !== "number" || typeof row.created_at !== "string"
      || typeof row.session_title !== "string" || typeof row.session_number !== "number") return [];
    return [{
      id: typeof row.delivery_id === "string" ? row.delivery_id : row.notification_id,
      deliveryId: typeof row.delivery_id === "string" ? row.delivery_id : null,
      caseId: row.counseling_case_id,
      caseSessionId: row.case_session_id,
      recipientName: typeof row.recipient_name === "string" ? row.recipient_name : null,
      status: row.status as HomeworkNotificationAlert["status"],
      statusCode: typeof row.status_code === "string" ? row.status_code : null,
      cycle: row.completion_cycle,
      createdAt: row.created_at,
      sessionTitle: row.session_title,
      sessionNumber: row.session_number,
    }];
  });
  return { alerts, error: false };
}

export function homeworkNotificationStatusMessage(status: HomeworkNotificationAlert["status"], statusCode: string | null) {
  if (status === "uncertain") return "Resend's acceptance is unresolved. This notice cannot be manually retried until provider evidence is reconciled.";
  if (status === "blocked") return "No eligible assigned Counselor was available when both partners submitted. No email was queued.";
  if (statusCode === "recipient_email_missing" || statusCode === "recipient_email_invalid") return "The Counselor's email address needs correction before the one-time recovery can be requested.";
  if (statusCode === "provider_idempotency_window_expired") return "The safe provider retry window expired. This delivery cannot be retried automatically.";
  return "This Counselor's delivery failed. Admins may request the one-time recovery; the database verifies eligibility and confirmed non-acceptance.";
}
