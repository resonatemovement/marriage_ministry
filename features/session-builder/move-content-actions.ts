"use server";

import { revalidatePath } from "next/cache";

import { requireSessionBuilderAccess } from "./access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type HomeworkMoveDestination = {
  versionId: string | null;
  updatedAt: string | null;
  pages: Array<{ id: string; title: string; position: number }>;
};

type HomeworkMoveVersion = {
  id: string;
  status: "draft" | "published";
  updated_at: string;
  version_number: number | null;
  page_manifest: unknown;
};

export async function getHomeworkMoveDestination(sessionId: string): Promise<HomeworkMoveDestination | null> {
  await requireSessionBuilderAccess(`/session-builder/${sessionId}`);
  const supabase = await createServerSupabaseClient();
  const { data: session, error: sessionError } = await supabase.from("sessions")
    .select("id,status").eq("id", sessionId).maybeSingle();
  if (sessionError || !session || session.status === "archived") return null;

  const { data: homework, error: homeworkError } = await supabase.from("homeworks")
    .select("id,withdrawn_at").eq("session_id", sessionId).maybeSingle();
  if (homeworkError) return null;
  if (!homework) return { versionId: null, updatedAt: null, pages: [] };
  if (homework.withdrawn_at) return null;

  const { data: rawVersions, error: versionsError } = await supabase.from("homework_versions")
    .select("*")
    .eq("homework_id", homework.id).order("created_at", { ascending: false });
  if (versionsError) return null;
  const versions = (rawVersions ?? []) as unknown as HomeworkMoveVersion[];
  const selected = versions?.find((version) => version.status === "draft")
    ?? versions?.filter((version) => version.status === "published").sort((left, right) => (right.version_number ?? 0) - (left.version_number ?? 0))[0];
  if (!selected) return { versionId: null, updatedAt: null, pages: [] };

  if (Array.isArray(selected.page_manifest)) {
    const pages = selected.page_manifest.flatMap((page) => page && typeof page === "object" && !Array.isArray(page)
      && typeof page.id === "string" && typeof page.title === "string" && typeof page.position === "number"
      ? [{ id: page.id, title: page.title, position: page.position }] : []);
    return { versionId: selected.id, updatedAt: selected.updated_at, pages };
  }

  const { count, error: blocksError } = await supabase.from("homework_version_blocks")
    .select("id", { count: "exact", head: true }).eq("homework_version_id", selected.id);
  if (blocksError) return null;
  return { versionId: selected.id, updatedAt: selected.updated_at,
    pages: count ? [{ id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 }] : [] };
}

export type MoveContentInput = {
  sourceSessionId: string;
  destinationSessionId: string;
  kind: "session_material_page" | "session_material_resource" | "homework_page" | "homework_block";
  itemId: string;
  sourceSessionUpdatedAt: string;
  sourceHomeworkVersionId?: string | null;
  sourceHomeworkUpdatedAt?: string | null;
  destinationHomeworkVersionId?: string | null;
  destinationHomeworkUpdatedAt?: string | null;
  destinationSessionUpdatedAt: string;
  destinationPageId?: string | null;
};

const safeMessages = new Set([
  "Not authorized",
  "Invalid Session content move",
  "A source or destination Session is unavailable",
  "Session content changed. Reload both Sessions and try again.",
  "A published Session must retain at least one Session Material block",
  "Session Material moves require Draft Sessions",
  "The selected Session Material is no longer available to move",
  "Source Homework is unavailable",
  "Homework Draft changed. Reload and try again.",
  "Homework version changed. Reload and try again.",
  "Source Homework Draft changed or is not editable",
  "Destination Homework Draft changed. Reload and try again.",
  "Destination Homework changed. Reload and try again.",
  "Destination Homework Draft is not editable",
  "Destination Homework page is unavailable",
  "Destination Homework page is unavailable",
  "The selected Homework page is no longer available to move",
  "Add another Homework page before moving the only page",
  "The selected Homework item is no longer available to move",
  "The selected Side-by-Side item is incomplete",
  "No editable Homework content was moved",
]);

export async function moveSessionBuilderContent(input: MoveContentInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSessionBuilderAccess(`/session-builder/${input.sourceSessionId}`);
  const supabase = await createServerSupabaseClient();
  const invoke = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await invoke("move_session_builder_content_between_sessions", {
    source_session_id: input.sourceSessionId,
    destination_session_id: input.destinationSessionId,
    move_kind: input.kind,
    source_item_id: input.itemId,
    source_homework_version_id: input.sourceHomeworkVersionId ?? null,
    source_session_updated_at: input.sourceSessionUpdatedAt,
    source_homework_updated_at: input.sourceHomeworkUpdatedAt ?? null,
    destination_homework_version_id: input.destinationHomeworkVersionId ?? null,
    destination_session_updated_at: input.destinationSessionUpdatedAt,
    destination_homework_updated_at: input.destinationHomeworkUpdatedAt ?? null,
    destination_page_id: input.destinationPageId ?? null,
  });
  if (error) {
    const message = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && safeMessages.has(error.message)
      ? error.message : "The content could not be moved. Reload both Sessions and try again.";
    return { ok: false, error: message };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)
    || (data as Record<string, unknown>).source_session_id !== input.sourceSessionId
    || (data as Record<string, unknown>).destination_session_id !== input.destinationSessionId) {
    return { ok: false, error: "The move result could not be confirmed. Reload both Sessions to check the latest content." };
  }
  revalidatePath(`/session-builder/${input.sourceSessionId}`);
  revalidatePath(`/session-builder/${input.destinationSessionId}`);
  revalidatePath("/session-builder");
  return { ok: true };
}
