import type { Json } from "@/types/database.generated";

import type { HomeworkDraftBlock } from "./queries";
import { homeworkAnswerChoicesFromJson, type HomeworkAnswerChoice } from "./selection-question";
import { reorderedBlockIds } from "@/features/session-builder/model";
import { isDeleteConfirmation } from "@/components/shared/destructive-confirmation";
import { groupSideBySideRows, type SideBySideResponseConfig, type SideBySideResponseIds } from "./side-by-side-response";
import { richTextBlockIsComplete, videoLinkIsComplete } from "@/components/shared/authoring-completion";
import { isValidHomeworkVideoUrl } from "./homework-url";

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
  sideBySideConfig?: Omit<SideBySideResponseConfig, "side"> | null;
  sideBySideResponseIds?: SideBySideResponseIds | null;
};

export type { HomeworkAnswerChoice } from "./selection-question";

export type HomeworkEditorState = {
  versionId: string | null;
  versionStatus: "draft" | "published" | null;
  blocks: StagedHomeworkBlock[];
  baseline: StagedHomeworkBlock[];
  editingKey: string | null;
  editingOriginal: StagedHomeworkBlock | null;
};

export const HOMEWORK_AUTHORING_BLOCK_TYPES = ["rich_text", "video_link", "long_answer", "checkbox_question", "radio_question", "side_by_side_response"] as const;

export function homeworkEditorStateFromRows(versionId: string, rows: HomeworkDraftBlock[], versionStatus: "draft" | "published" = "draft"): HomeworkEditorState {
  const blocks = groupSideBySideRows(rows.map((row) => ({ ...row, type: row.blockType }))).map((group) => {
    if (group.kind === "pair") return {
      key: group.config.groupId,
      persistedId: group.left.id,
      homeworkBlockId: group.left.homeworkBlockId,
      blockType: "side_by_side_response",
      position: Math.min(group.left.position, group.right.position),
      title: null,
      richTextContent: null,
      url: null,
      description: null,
      questionChoices: [],
      isRequired: group.config.bothRequired,
      sideBySideConfig: group.config,
      sideBySideResponseIds: {
        left: { snapshotId: group.left.id, homeworkBlockId: group.left.homeworkBlockId },
        right: { snapshotId: group.right.id, homeworkBlockId: group.right.homeworkBlockId },
      },
    };
    const row = group.row;
    return {
      key: row.id,
      persistedId: row.id,
      homeworkBlockId: row.homeworkBlockId,
      blockType: row.blockType,
      position: row.position,
      title: row.title,
      richTextContent: row.richTextContent,
      url: row.url,
      description: row.description,
      questionChoices: homeworkAnswerChoicesFromJson(row.questionChoices ?? null),
      isRequired: row.isRequired ?? true,
      sideBySideConfig: null,
      sideBySideResponseIds: null,
    };
  });
  const normalizedBlocks = normalizeHomeworkBlockPositions(blocks);
  return { versionId, versionStatus, blocks: normalizedBlocks, baseline: structuredClone(normalizedBlocks), editingKey: null, editingOriginal: null };
}

export function persistHomeworkEditorState(state: HomeworkEditorState, rows: HomeworkDraftBlock[], versionId: string, versionStatus: "draft" | "published"): HomeworkEditorState {
  const next = homeworkEditorStateFromRows(versionId, rows, versionStatus);
  const blocks = next.blocks.map((block) => {
    const clientId = rows.find((row) => row.id === block.persistedId)?.clientId;
    const match = state.blocks.find((current) => current.persistedId === block.persistedId)
      ?? state.blocks.find((current) => current.sideBySideResponseIds?.left.snapshotId === block.persistedId)
      ?? state.blocks.find((current) => current.sideBySideConfig?.groupId === block.sideBySideConfig?.groupId)
      ?? state.blocks.find((current) => current.persistedId === null && current.key === clientId);
    return match ? { ...block, key: match.key } : block;
  });
  return { versionId, versionStatus, blocks, baseline: structuredClone(blocks), editingKey: null, editingOriginal: null };
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
    sideBySideConfig: blockType === "side_by_side_response" ? {
      groupId: crypto.randomUUID(),
      instructions: "",
      leftHeading: "",
      rightHeading: "",
      bothRequired: true,
      responseMode: "paired_rows_v1",
    } : null,
    sideBySideResponseIds: null,
  };
}

export function addHomeworkBlock(state: HomeworkEditorState, block: StagedHomeworkBlock) {
  return { ...state, blocks: normalizeHomeworkBlockPositions([...state.blocks, block]), editingKey: block.key, editingOriginal: null };
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
    sideBySideConfig: source.sideBySideConfig ? { ...source.sideBySideConfig, groupId: crypto.randomUUID() } : null,
    sideBySideResponseIds: null,
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
  return { ...state, editingKey: null, editingOriginal: null };
}

export function beginHomeworkBlockEditing(state: HomeworkEditorState, key: string | null) {
  const block = key ? state.blocks.find((item) => item.key === key) : null;
  return { ...state, editingKey: block?.key ?? null, editingOriginal: block ? structuredClone(block) : null };
}

export function cancelHomeworkBlockEditing(state: HomeworkEditorState) {
  if (!state.editingKey) return state;
  const blocks = state.editingOriginal
    ? state.blocks.map((block) => block.key === state.editingKey ? structuredClone(state.editingOriginal!) : block)
    : state.blocks.filter((block) => block.key !== state.editingKey);
  return { ...state, blocks: normalizeHomeworkBlockPositions(blocks), editingKey: null, editingOriginal: null };
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
    sideBySideConfig: block.sideBySideConfig,
    sideBySideResponseIds: block.sideBySideResponseIds,
  };
}

export function homeworkEditorIsDirty(state: HomeworkEditorState) {
  return JSON.stringify(state.blocks.map(comparable)) !== JSON.stringify(state.baseline.map(comparable));
}

export function sideBySideHeadingsAreValid(config: StagedHomeworkBlock["sideBySideConfig"]) {
  return Boolean(config?.leftHeading.trim() && config.rightHeading.trim());
}

export function homeworkSideBySideHeadingsAreValid(state: HomeworkEditorState) {
  return state.blocks.every((block) => block.blockType !== "side_by_side_response" || sideBySideHeadingsAreValid(block.sideBySideConfig));
}

export function homeworkBlockIsComplete(block: StagedHomeworkBlock) {
  if (block.blockType === "side_by_side_response") return sideBySideHeadingsAreValid(block.sideBySideConfig);
  if (block.blockType === "rich_text") return richTextBlockIsComplete(block.title, block.richTextContent);
  if (block.blockType === "long_answer") return richTextBlockIsComplete(null, block.richTextContent, false);
  if (block.blockType === "video_link") return videoLinkIsComplete({ title: block.title ?? "", url: block.url ?? "", description: block.description ?? "" }, isValidHomeworkVideoUrl);
  if (block.blockType === "checkbox_question" || block.blockType === "radio_question") {
    const choices = block.questionChoices;
    return richTextBlockIsComplete(null, block.richTextContent, false)
      && choices.length >= 2
      && choices.every((choice) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(choice.id) && Boolean(choice.label.trim()))
      && new Set(choices.map(({ id }) => id)).size === choices.length;
  }
  return true;
}

export function homeworkEditorCanCommit(state: HomeworkEditorState) {
  return state.editingKey === null && state.blocks.every(homeworkBlockIsComplete);
}

export function restoreHomeworkEditorState(state: HomeworkEditorState) {
  return { ...state, blocks: structuredClone(state.baseline), editingKey: null, editingOriginal: null };
}
