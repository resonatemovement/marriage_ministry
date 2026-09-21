import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { SessionStatus } from "./model";
import type { SessionSummary } from "./types";
import type { Database } from "@/types/database.generated";

function summary(row: Pick<Database["public"]["Tables"]["sessions"]["Row"], "id" | "sequence_number" | "title" | "status" | "updated_at">): SessionSummary {
  return {
    id: row.id,
    sequenceNumber: row.sequence_number,
    title: row.title,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function getSessions(status?: SessionStatus): Promise<SessionSummary[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("sessions").select("id,sequence_number,title,status,updated_at");
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("sequence_number", { ascending: true });
  if (error) throw new Error("Session Builder data is unavailable");
  return (data ?? []).map(summary);
}

export async function getSession(sessionId: string): Promise<SessionSummary | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sessions").select("id,sequence_number,title,status,updated_at").eq("id", sessionId).maybeSingle();
  return error || !data ? null : summary(data);
}
