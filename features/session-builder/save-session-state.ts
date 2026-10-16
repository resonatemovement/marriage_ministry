"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { requireSessionBuilderAccess } from "./access";
import { materialForRpc, sessionStateFromRpc, type PersistedResult, type SessionEditorState } from "./editor-model";
import type { HomeworkEditorState } from "@/features/homework/homework-editor-model";
import type { HomeworkDraftBlock } from "@/features/homework/queries";

type AuthoringIntent = "save" | "publish" | "publish_changes";
type SavedHomeworkResult = {
  versionId: string | null;
  status: "draft" | "published" | null;
  versionNumber: number | null;
  blocks: HomeworkDraftBlock[];
};
type SaveSessionResult = {
  sessionState: PersistedResult | null;
  homework: SavedHomeworkResult;
} | { error: string; errorKind: "validation" | "operation" };

type RpcInvoker = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

const userFacingRpcErrors = new Set([
  "Enter a valid session title",
  "Add at least one Session Material block before publishing",
  "Invalid Session Material block",
  "Unsupported Session Material field",
  "Invalid Session Material text field",
  "Unsupported Session Material type",
  "Session Material title is too long",
  "Invalid Rich Text material",
  "Rich Text material cannot be empty",
  "Enter a valid http or https URL for the Video / Link block",
  "Invalid library Resource block",
  "Invalid persisted Session Material ID",
  "Duplicate Session Material ID",
  "Session Material block does not belong to this Session",
  "New Session Material requires a client ID",
  "Invalid or duplicate Session Material client ID",
  "Resource category does not match Session block",
  "Archived Resource cannot be newly selected",
  "Session Resource type cannot change",
  "Homework publishing must match the Session action",
  "Homework blocks must be an array",
  "Homework draft is unavailable",
  "Select a valid Homework draft or remove the unavailable Homework selection",
  "Homework Draft changed. Reload and try again.",
  "Invalid Homework block",
  "Unsupported Homework block type",
  "Homework title is too long",
  "Invalid Homework text block",
  "Enter a valid http or https Homework URL",
  "Duplicate Homework block ID",
  "Homework block does not belong to the editable version",
  "Homework block identity does not match its version snapshot",
  "Homework block belongs to another Homework",
  "New Homework block requires a client ID",
  "Invalid or duplicate Homework client ID",
]);

function errorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error) || typeof error.message !== "string") return null;
  return userFacingRpcErrors.has(error.message) ? error.message : null;
}

function failureMessage(intent: AuthoringIntent, error: unknown) {
  const knownError = errorMessage(error);
  if (knownError) return { error: knownError, errorKind: "validation" as const };
  return operationFailure(intent);
}

function operationFailure(intent: AuthoringIntent) {
  if (intent === "publish") return { error: "The Session could not be published. Please try again.", errorKind: "operation" as const };
  if (intent === "publish_changes") return { error: "Homework changes could not be published. Please try again.", errorKind: "operation" as const };
  return { error: "Changes could not be saved. Please try again.", errorKind: "operation" as const };
}

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
    target_is_final: editor.isFinal,
    target_material: materialForRpc(editor.blocks),
    save_session: options.saveSession,
    target_homework_version_id: homeworkEditor.versionId,
    target_homework_blocks: serializeHomeworkBlocks(homeworkEditor),
    save_homework: options.saveHomework,
    publish_homework: options.publishHomework,
    target_session_intent: options.intent,
  });
  if (error) return failureMessage(options.intent, error);
  if (!data || typeof data !== "object" || Array.isArray(data)) return operationFailure(options.intent);
  const response = data as Record<string, unknown>;
  const sessionState = options.saveSession || options.intent === "publish"
    ? sessionStateFromRpc(response.session as never, editor.blocks)
    : null;
  const homework = parseHomeworkResult(response.homework);
  if ((options.saveSession || options.intent === "publish") && !sessionState || !homework) {
    const errorMessage = options.intent === "publish" ? "The Session publish result could not be confirmed. Reload to check its status."
      : options.intent === "publish_changes" ? "The Homework publish result could not be confirmed. Reload to check its status."
        : "The save result could not be confirmed. Reload to check the latest state.";
    return { error: errorMessage, errorKind: "operation" };
  }

  revalidatePath("/session-builder");
  const savedSessionId = sessionState?.sessionId ?? editor.sessionId;
  if (savedSessionId) revalidatePath(`/session-builder/${savedSessionId}`);
  return { sessionState, homework };
}
