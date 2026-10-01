import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { SessionStatus } from "./model";
import type { SessionSummary } from "./types";
import type { SessionMaterialBlock } from "./types";
import type { Database } from "@/types/database.generated";
import { withCurriculumNumbers } from "./presentation";
import { getResourceDetail, signedResourceAccess } from "@/features/resource-library/server";
import type { ResourceCategory } from "@/features/resource-library/policy";

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
  // This boundary stays narrow until DEV OAuth permits generated-type refresh.
  const { data, error } = await supabase.from("session_material_blocks").select("*").eq("session_id", sessionId).order("position", { ascending: true });
  if (error) throw new Error("Session Material is unavailable");
  type MaterialRow = Database["public"]["Tables"]["session_material_blocks"]["Row"] & { resource_id: string | null; resource_category: string | null };
  const rows = (data ?? []) as unknown as MaterialRow[];
  const resources = new Map(await Promise.all([...new Set(rows.flatMap((row) => row.resource_id ? [row.resource_id] : []))].map(async (id) => {
    const { resource, versions } = await getResourceDetail(id);
    const version = versions.find((item) => item.id === resource.current_version_id);
    if (!version) throw new Error("Linked Resource version is unavailable");
    const access = await signedResourceAccess(id);
    return [id, { id, title: resource.title, description: resource.description, category: resource.category as ResourceCategory,
      archivedAt: resource.archived_at, createdAt: resource.created_at, updatedAt: resource.updated_at, canManage: false,
      currentVersion: { originalFilename: version.original_filename, mimeType: version.mime_type, sizeBytes: version.size_bytes, uploadedAt: version.created_at },
      previewUrl: access.signedUrl }] as const;
  })));
  return rows.map((row) => ({ id: row.id, sessionId: row.session_id, blockType: row.block_type as SessionMaterialBlock["blockType"], position: row.position, title: row.title, richTextContent: row.rich_text_content as Record<string, unknown> | null, url: row.url, description: row.description,
    resourceId: row.resource_id, resourceCategory: row.resource_category as ResourceCategory | null, resource: row.resource_id ? resources.get(row.resource_id) ?? null : null }));
}
