import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { SessionStatus } from "./model";
import type { SessionSummary } from "./types";
import type { SessionMaterialBlock } from "./types";
import type { Database } from "@/types/database.generated";
import { withCurriculumNumbers } from "./presentation";

function summary(row: Pick<Database["public"]["Tables"]["sessions"]["Row"], "id" | "sequence_number" | "title" | "status" | "updated_at">): SessionSummary {
  return {
    id: row.id,
    sequenceNumber: row.sequence_number,
    curriculumNumber: 0,
    title: row.title,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function getSessions(status?: SessionStatus): Promise<SessionSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sessions").select("id,sequence_number,title,status,updated_at").order("sequence_number", { ascending: true });
  if (error) throw new Error("Session Builder data is unavailable");
  const sessions = withCurriculumNumbers((data ?? []).map(summary));
  return status ? sessions.filter((session) => session.status === status) : sessions;
}

export async function getSession(sessionId: string): Promise<SessionSummary | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("sessions").select("id,sequence_number,title,status,updated_at").eq("id", sessionId).maybeSingle();
  if (error || !data) return null;
  const { count, error: countError } = await supabase.from("sessions").select("id", { count: "exact", head: true }).lt("sequence_number", data.sequence_number);
  return countError ? null : { ...summary(data), curriculumNumber: (count ?? 0) + 1 };
}

export async function getSessionMaterialBlocks(sessionId: string): Promise<SessionMaterialBlock[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("session_material_blocks").select("id,session_id,block_type,position,title,rich_text_content,url,description").eq("session_id", sessionId).order("position", { ascending: true });
  if (error) throw new Error("Session Material is unavailable");
  return (data ?? []).map((row) => ({ id: row.id, sessionId: row.session_id, blockType: row.block_type as SessionMaterialBlock["blockType"], position: row.position, title: row.title, richTextContent: row.rich_text_content as Record<string, unknown> | null, url: row.url, description: row.description }));
}
