import type { Json } from "@/types/database.generated";

import type { HomeworkDraftBlock } from "./queries";
import { reorderedBlockIds } from "@/features/session-builder/model";
import { isDeleteConfirmation } from "@/components/shared/destructive-confirmation";

export type StagedHomeworkBlock = {
  key: string;
  persistedId: string | null;
  homeworkBlockId: string | null;
  blockType: string;
  position: number;
  title: string | null;
  richTextContent: Json | null;
  url: string | null;
  description: string | null;
};

export type HomeworkEditorState = {
  versionId: string | null;
  versionStatus: "draft" | "published" | null;
  blocks: StagedHomeworkBlock[];
  baseline: StagedHomeworkBlock[];
  editingKey: string | null;
};

export const HOMEWORK_AUTHORING_BLOCK_TYPES = ["rich_text", "video_link", "long_answer"] as const;

export function homeworkEditorStateFromRows(versionId: string, rows: HomeworkDraftBlock[], versionStatus: "draft" | "published" = "draft"): HomeworkEditorState {
  const blocks = rows.map((row) => ({
    key: row.id,
    persistedId: row.id,
    homeworkBlockId: row.homeworkBlockId,
    blockType: row.blockType,
    position: row.position,
    title: row.title,
    richTextContent: row.richTextContent,
    url: row.url,
    description: row.description,
  }));
  return { versionId, versionStatus, blocks, baseline: structuredClone(blocks), editingKey: null };
}

export function persistHomeworkEditorState(state: HomeworkEditorState, rows: HomeworkDraftBlock[], versionId: string, versionStatus: "draft" | "published"): HomeworkEditorState {
  const next = homeworkEditorStateFromRows(versionId, rows, versionStatus);
  const blocks = next.blocks.map((block, index) => {
    const clientId = rows[index]?.clientId;
    const match = state.blocks.find((current) => current.persistedId === block.persistedId)
      ?? state.blocks.find((current) => current.persistedId === null && current.key === clientId);
    return match ? { ...block, key: match.key } : block;
  });
  return { versionId, versionStatus, blocks, baseline: structuredClone(blocks), editingKey: null };
}

export function initializeHomeworkEditorState(current: HomeworkEditorState, versionId: string, rows: HomeworkDraftBlock[], status: "draft" | "published" = "draft") {
  return current.versionId === versionId ? current : homeworkEditorStateFromRows(versionId, rows, status);
}

export function newHomeworkBlock(blockType: typeof HOMEWORK_AUTHORING_BLOCK_TYPES[number], position: number): StagedHomeworkBlock {
  return {
    key: `local:${crypto.randomUUID()}`,
    persistedId: null,
    homeworkBlockId: null,
    blockType,
    position,
    title: null,
    richTextContent: blockType === "video_link" ? null : { type: "doc", content: [{ type: "paragraph" }] },
    url: blockType === "video_link" ? "" : null,
    description: null,
  };
}

export function addHomeworkBlock(state: HomeworkEditorState, block: StagedHomeworkBlock) {
  return { ...state, blocks: normalizeHomeworkBlockPositions([...state.blocks, block]), editingKey: block.key };
}

export function normalizeHomeworkBlockPositions(blocks: StagedHomeworkBlock[]) {
  return blocks.map((block, position) => block.position === position ? block : { ...block, position });
}

export function reorderHomeworkBlocks(blocks: StagedHomeworkBlock[], activeKey: string, overKey: string) {
  const byKey = new Map(blocks.map((block) => [block.key, block]));
  const ordered = reorderedBlockIds(blocks.map((block) => block.key), activeKey, overKey)
    .map((key) => byKey.get(key)).filter((block): block is StagedHomeworkBlock => Boolean(block));
  return normalizeHomeworkBlockPositions(ordered);
}

export function homeworkMoveTarget(blocks: StagedHomeworkBlock[], key: string, direction: -1 | 1) {
  const index = blocks.findIndex((block) => block.key === key);
  return index < 0 ? null : blocks[index + direction]?.key ?? null;
}

export function duplicateHomeworkBlock(blocks: StagedHomeworkBlock[], key: string, duplicateKey = `local:${crypto.randomUUID()}`) {
  const index = blocks.findIndex((block) => block.key === key);
  if (index < 0) return { blocks, editingKey: null };
  const source = blocks[index];
  if (!HOMEWORK_AUTHORING_BLOCK_TYPES.some((type) => type === source.blockType)) return { blocks, editingKey: null };
  const duplicate: StagedHomeworkBlock = {
    ...source,
    key: duplicateKey,
    persistedId: null,
    homeworkBlockId: null,
    position: index + 1,
    richTextContent: source.richTextContent ? structuredClone(source.richTextContent) : null,
  };
  return { blocks: normalizeHomeworkBlockPositions([...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)]), editingKey: duplicate.key };
}

export function deleteHomeworkBlock(blocks: StagedHomeworkBlock[], key: string, confirmation: string) {
  if (!isDeleteConfirmation(confirmation)) return blocks;
  const target = blocks.find((block) => block.key === key);
  if (!target || !HOMEWORK_AUTHORING_BLOCK_TYPES.some((type) => type === target.blockType)) return blocks;
  return normalizeHomeworkBlockPositions(blocks.filter((block) => block.key !== key));
}

export function updateHomeworkBlock(state: HomeworkEditorState, key: string, update: Partial<StagedHomeworkBlock>) {
  return { ...state, blocks: state.blocks.map((block) => block.key === key ? { ...block, ...update } : block) };
}

export function finishHomeworkBlockEditing(state: HomeworkEditorState) {
  return { ...state, editingKey: null };
}

function comparable(block: StagedHomeworkBlock) {
  return {
    identity: block.persistedId ?? block.key,
    homeworkBlockId: block.homeworkBlockId,
    blockType: block.blockType,
    position: block.position,
    title: block.title,
    richTextContent: block.richTextContent,
    url: block.url,
    description: block.description,
  };
}

export function homeworkEditorIsDirty(state: HomeworkEditorState) {
  return JSON.stringify(state.blocks.map(comparable)) !== JSON.stringify(state.baseline.map(comparable));
}

export function restoreHomeworkEditorState(state: HomeworkEditorState) {
  return { ...state, blocks: structuredClone(state.baseline), editingKey: null };
}
