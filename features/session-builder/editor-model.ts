import type { Json } from "@/types/database.generated";

import { canPublishSession, isValidMaterialUrl, normalizeSessionTitle, reorderedBlockIds, type SessionStatus } from "./model";
import type { MaterialBlockType, SessionMaterialBlock, SessionSummary } from "./types";

export type StagedMaterialBlock = {
  key: string;
  persistedId: string | null;
  blockType: MaterialBlockType;
  title: string;
  richTextContent: Record<string, unknown> | null;
  url: string;
  description: string;
};

export type SessionEditorState = {
  sessionId: string | null;
  status: SessionStatus;
  title: string;
  blocks: StagedMaterialBlock[];
};

export const emptyRichText: Record<string, unknown> = { type: "doc", content: [{ type: "paragraph" }] };

export function initialSessionEditorState(session: SessionSummary | null, blocks: SessionMaterialBlock[] = []): SessionEditorState {
  return {
    sessionId: session?.id ?? null,
    status: session?.status ?? "draft",
    title: session?.title ?? "",
    blocks: blocks.map((block) => ({
      key: block.id,
      persistedId: block.id,
      blockType: block.blockType,
      title: block.title ?? "",
      richTextContent: block.richTextContent,
      url: block.url ?? "",
      description: block.description ?? "",
    })),
  };
}

export function newStagedBlock(blockType: MaterialBlockType): StagedMaterialBlock {
  return {
    key: `local:${crypto.randomUUID()}`,
    persistedId: null,
    blockType,
    title: "",
    richTextContent: blockType === "rich_text" ? structuredClone(emptyRichText) : null,
    url: "",
    description: "",
  };
}

export function duplicateStagedBlock(blocks: StagedMaterialBlock[], key: string): StagedMaterialBlock[] {
  const index = blocks.findIndex((block) => block.key === key);
  if (index < 0) return blocks;
  const source = blocks[index];
  const copy = { ...source, key: `local:${crypto.randomUUID()}`, persistedId: null,
    richTextContent: source.richTextContent ? structuredClone(source.richTextContent) : null };
  return [...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)];
}

export function moveStagedBlock(blocks: StagedMaterialBlock[], activeKey: string, overKey: string): StagedMaterialBlock[] {
  const keys = reorderedBlockIds(blocks.map((block) => block.key), activeKey, overKey);
  return keys.map((key) => blocks.find((block) => block.key === key)!);
}

function normalizedBlock(block: StagedMaterialBlock) {
  return {
    identity: block.persistedId ?? block.key,
    blockType: block.blockType,
    title: normalizeSessionTitle(block.title),
    richTextContent: block.blockType === "rich_text" ? block.richTextContent : null,
    url: block.blockType === "video_link" ? block.url.trim() : "",
    description: normalizeSessionTitle(block.description),
  };
}

export function editorStateIsDirty(current: SessionEditorState, baseline: SessionEditorState) {
  return JSON.stringify({ title: normalizeSessionTitle(current.title), blocks: current.blocks.map(normalizedBlock) })
    !== JSON.stringify({ title: normalizeSessionTitle(baseline.title), blocks: baseline.blocks.map(normalizedBlock) });
}

export function sessionEditorPageIsDirty(sessionDirty: boolean, homeworkDirty: boolean) {
  return sessionDirty || homeworkDirty;
}

export function restoreSessionEditorState(baseline: SessionEditorState): SessionEditorState {
  return structuredClone(baseline);
}

export function sessionSaveError(state: SessionEditorState): string | null {
  if (!normalizeSessionTitle(state.title)) return "Enter a session title.";
  if (state.blocks.some((block) => block.blockType === "video_link" && !isValidMaterialUrl(block.url))) {
    return "Enter a valid http or https URL for each Video / Link block.";
  }
  return null;
}

export function sessionPublishError(state: SessionEditorState): string | null {
  return canPublishSession(state.title, state.blocks.map((block) => ({
    blockType: block.blockType,
    richTextContent: block.richTextContent,
    url: block.url,
  })));
}

export function materialForRpc(blocks: StagedMaterialBlock[]): Json {
  return blocks.map((block) => ({
    ...(block.persistedId ? { id: block.persistedId } : { client_id: block.key }),
    block_type: block.blockType,
    title: normalizeSessionTitle(block.title) || null,
    rich_text_content: block.blockType === "rich_text" ? block.richTextContent as Json : null,
    url: block.blockType === "video_link" ? block.url.trim() : null,
    description: normalizeSessionTitle(block.description) || null,
  }));
}

export type PersistedResult = { sessionId: string; status: "draft" | "published"; title: string; blocks: StagedMaterialBlock[] };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function sessionStateFromRpc(value: Json, previousBlocks: StagedMaterialBlock[]): PersistedResult | null {
  const result = record(value);
  if (!result || typeof result.session_id !== "string" || typeof result.title !== "string"
    || (result.status !== "draft" && result.status !== "published") || !Array.isArray(result.blocks)) return null;

  const blocks: StagedMaterialBlock[] = [];
  for (const item of result.blocks) {
    const block = record(item);
    if (!block || typeof block.id !== "string" || (block.block_type !== "rich_text" && block.block_type !== "video_link")
      || typeof block.position !== "number" || typeof block.title !== "string" && block.title !== null
      || typeof block.url !== "string" && block.url !== null
      || typeof block.description !== "string" && block.description !== null) return null;
    const matched = previousBlocks.find((existing) => existing.persistedId === block.id || existing.key === block.client_id);
    const richTextContent = record(block.rich_text_content);
    if (block.block_type === "rich_text" && !richTextContent) return null;
    if (block.position !== blocks.length) return null;
    blocks.push({
      key: matched?.key ?? block.id,
      persistedId: block.id,
      blockType: block.block_type,
      title: block.title ?? "",
      richTextContent,
      url: block.url ?? "",
      description: block.description ?? "",
    });
  }
  if (new Set(blocks.map((block) => block.persistedId)).size !== blocks.length) return null;
  return { sessionId: result.session_id, status: result.status, title: result.title, blocks };
}
