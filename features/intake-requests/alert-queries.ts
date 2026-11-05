import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface IntakeRequestAlert {
  requestId: string;
  campusId: string;
  campusName: string;
  requestStatus: string;
  alertType: string;
  submittedAt: string;
  statusEnteredAt: string;
  thresholdHours: number;
  elapsedHours: number;
  incompletePartners: { personPosition: string; firstName: string; lastName: string }[];
}

type RawAlert = {
  request_id: string;
  campus_id: string;
  campus_name: string;
  request_status: string;
  alert_type: string;
  submitted_at: string;
  status_entered_at: string;
  threshold_hours: number;
  elapsed_hours: number;
  incomplete_partners: unknown;
};

function parseIncompletePartners(value: unknown): IntakeRequestAlert["incompletePartners"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const partner = item as Record<string, unknown>;
    if (typeof partner.firstName !== "string" || typeof partner.lastName !== "string" || typeof partner.personPosition !== "string") return [];
    return [{ firstName: partner.firstName, lastName: partner.lastName, personPosition: partner.personPosition }];
  });
}

export async function getIntakeRequestAlerts(targetCampusId?: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("get_intake_request_alerts", targetCampusId ? { target_campus_id: targetCampusId } : {});
  if (error || !data) return { alerts: [] as IntakeRequestAlert[], error: "unavailable" as const };

  return {
    alerts: (data as RawAlert[]).map((alert) => ({
      requestId: alert.request_id,
      campusId: alert.campus_id,
      campusName: alert.campus_name,
      requestStatus: alert.request_status,
      alertType: alert.alert_type,
      submittedAt: alert.submitted_at,
      statusEnteredAt: alert.status_entered_at,
      thresholdHours: alert.threshold_hours,
      elapsedHours: Number(alert.elapsed_hours),
      incompletePartners: parseIncompletePartners(alert.incomplete_partners),
    })),
    error: null,
  } as const;
}
