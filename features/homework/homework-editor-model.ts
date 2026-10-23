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
  questionChoices: HomeworkAnswerChoice[];
  isRequired: boolean;
};

export type HomeworkAnswerChoice = { id: string; label: string };

export type HomeworkEditorState = {
  versionId: string | null;
  versionStatus: "draft" | "published" | null;
  blocks: StagedHomeworkBlock[];
  baseline: StagedHomeworkBlock[];
  editingKey: string | null;
};

export const HOMEWORK_AUTHORING_BLOCK_TYPES = ["rich_text", "video_link", "long_answer", "checkbox_question", "radio_question"] as const;

function questionChoicesFromJson(value: Json | null): HomeworkAnswerChoice[] {
  if (!Array.isArray(value)) return [];
  return value.filter((choice): choice is { id: string; label: string } =>
    Boolean(choice && typeof choice === "object" && !Array.isArray(choice)
      && "id" in choice && typeof choice.id === "string"
      && "label" in choice && typeof choice.label === "string"),
  ).map(({ id, label }) => ({ id, label }));
}

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
    questionChoices: questionChoicesFromJson(row.questionChoices ?? null),
    isRequired: row.isRequired ?? true,
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
  const isSelectionQuestion = blockType === "checkbox_question" || blockType === "radio_question";
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
    questionChoices: isSelectionQuestion
      ? [{ id: crypto.randomUUID(), label: "" }, { id: crypto.randomUUID(), label: "" }]
      : [],
    isRequired: true,
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
    questionChoices: source.questionChoices.map((choice) => ({ ...choice, id: crypto.randomUUID() })),
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

export function addHomeworkQuestionChoice(state: HomeworkEditorState, key: string) {
  return updateHomeworkBlock(state, key, {
    questionChoices: [...(state.blocks.find((block) => block.key === key)?.questionChoices ?? []), { id: crypto.randomUUID(), label: "" }],
  });
}

export function updateHomeworkQuestionChoice(state: HomeworkEditorState, key: string, choiceId: string, label: string) {
  return updateHomeworkBlock(state, key, {
    questionChoices: (state.blocks.find((block) => block.key === key)?.questionChoices ?? []).map((choice) => choice.id === choiceId ? { ...choice, label } : choice),
  });
}

export function deleteHomeworkQuestionChoice(state: HomeworkEditorState, key: string, choiceId: string) {
  return updateHomeworkBlock(state, key, {
    questionChoices: (state.blocks.find((block) => block.key === key)?.questionChoices ?? []).filter((choice) => choice.id !== choiceId),
  });
}

export function reorderHomeworkQuestionChoices(state: HomeworkEditorState, key: string, choiceId: string, direction: -1 | 1) {
  const block = state.blocks.find((item) => item.key === key);
  if (!block) return state;
  const index = block.questionChoices.findIndex((choice) => choice.id === choiceId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= block.questionChoices.length) return state;
  const questionChoices = [...block.questionChoices];
  [questionChoices[index], questionChoices[target]] = [questionChoices[target]!, questionChoices[index]!];
  return updateHomeworkBlock(state, key, { questionChoices });
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
    questionChoices: block.questionChoices,
    isRequired: block.isRequired,
  };
}

export function homeworkEditorIsDirty(state: HomeworkEditorState) {
  return JSON.stringify(state.blocks.map(comparable)) !== JSON.stringify(state.baseline.map(comparable));
}

export function restoreHomeworkEditorState(state: HomeworkEditorState) {
  return { ...state, blocks: structuredClone(state.baseline), editingKey: null };
}
