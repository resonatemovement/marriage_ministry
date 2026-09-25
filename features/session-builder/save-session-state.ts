"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { requireSessionBuilderAccess } from "./access";
import { materialForRpc, sessionStateFromRpc, type PersistedResult, type SessionEditorState } from "./editor-model";
import type { HomeworkEditorState } from "@/features/homework/homework-editor-model";
import type { HomeworkDraftBlock } from "@/features/homework/queries";

export type AuthoringIntent = "save" | "publish" | "publish_changes";
export type SavedHomeworkResult = {
  versionId: string | null;
  status: "draft" | "published" | null;
  versionNumber: number | null;
  blocks: HomeworkDraftBlock[];
};
export type SaveSessionResult = {
  sessionState: PersistedResult | null;
  homework: SavedHomeworkResult;
} | { error: string };

type RpcInvoker = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

function serializeHomeworkBlocks(editor: HomeworkEditorState) {
  return editor.blocks.map((block) => ({
    ...(block.persistedId ? { id: block.persistedId } : { client_id: block.key }),
    ...(block.homeworkBlockId ? { homework_block_id: block.homeworkBlockId } : {}),
    block_type: block.blockType,
    title: block.title,
    rich_text_content: block.richTextContent,
    url: block.url,
    description: block.description,
  }));
}

function parseHomeworkResult(value: unknown): SavedHomeworkResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.version_id !== null && typeof data.version_id !== "string") return null;
  if (data.status !== null && data.status !== "draft" && data.status !== "published") return null;
  if (data.version_number !== null && typeof data.version_number !== "number") return null;
  if (!Array.isArray(data.blocks)) return null;
  const blocks: HomeworkDraftBlock[] = [];
  for (const value of data.blocks) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const block = value as Record<string, unknown>;
    if (typeof block.id !== "string" || typeof block.homework_block_id !== "string"
      || typeof block.block_type !== "string" || typeof block.position !== "number"
      || block.title !== null && typeof block.title !== "string"
      || block.url !== null && typeof block.url !== "string"
      || block.description !== null && typeof block.description !== "string"
      || block.client_id !== undefined && block.client_id !== null && typeof block.client_id !== "string") return null;
    blocks.push({ id: block.id, homeworkBlockId: block.homework_block_id, blockType: block.block_type,
      position: block.position, title: block.title as string | null, richTextContent: (block.rich_text_content ?? null) as HomeworkDraftBlock["richTextContent"],
      url: block.url as string | null, description: block.description as string | null,
      clientId: block.client_id as string | null | undefined });
  }
  return { versionId: data.version_id as string | null, status: data.status as "draft" | "published" | null,
    versionNumber: data.version_number as number | null, blocks };
}

export async function saveSessionBuilderState(
  editor: SessionEditorState,
  homeworkEditor: HomeworkEditorState,
  options: { intent: AuthoringIntent; saveSession: boolean; saveHomework: boolean; publishHomework: boolean },
): Promise<SaveSessionResult> {
  await requireSessionBuilderAccess(editor.sessionId ? `/session-builder/${editor.sessionId}` : "/session-builder/new");
  const supabase = await createServerSupabaseClient();
  // The orchestration RPC is intentionally isolated here until generated types are refreshed.
  const invoke = supabase.rpc.bind(supabase) as unknown as RpcInvoker;
  const { data, error } = await invoke("save_session_homework_authoring_state", {
    target_session_id: editor.sessionId,
    target_title: editor.title,
    target_material: materialForRpc(editor.blocks),
    save_session: options.saveSession,
    target_homework_version_id: homeworkEditor.versionId,
    target_homework_blocks: serializeHomeworkBlocks(homeworkEditor),
    save_homework: options.saveHomework,
    publish_homework: options.publishHomework,
    target_session_intent: options.intent,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return { error: "The Session and Homework could not be saved. Please check the content and try again." };
  const response = data as Record<string, unknown>;
  const sessionState = options.saveSession || options.intent === "publish"
    ? sessionStateFromRpc(response.session as never, editor.blocks)
    : null;
  const homework = parseHomeworkResult(response.homework);
  if ((options.saveSession || options.intent === "publish") && !sessionState || !homework) {
    return { error: "The Session and Homework were saved, but the response could not be read. Reload to review it." };
  }

  revalidatePath("/session-builder");
  const savedSessionId = sessionState?.sessionId ?? editor.sessionId;
  if (savedSessionId) revalidatePath(`/session-builder/${savedSessionId}`);
  return { sessionState, homework };
}
