"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { HomeworkDraftBlock } from "./queries";
import { addHomeworkBlock, addHomeworkPage, addHomeworkQuestionChoice, beginHomeworkBlockEditing, cancelHomeworkBlockEditing, deleteHomeworkBlock, deleteHomeworkPage, deleteHomeworkQuestionChoice, duplicateHomeworkBlock, finishHomeworkBlockEditing, homeworkEditorCanCommit, homeworkEditorIsDirty, homeworkPagesArePublishable, homeworkSideBySideHeadingsAreValid, homeworkEditorStateFromRows, initializeHomeworkEditorState, moveHomeworkBlockToPage, newHomeworkBlock, persistHomeworkEditorState, reorderHomeworkBlocksOnPage, reorderHomeworkPages, reorderHomeworkQuestionChoices, renameHomeworkPage, restoreHomeworkEditorState, selectHomeworkPage, updateHomeworkBlock, updateHomeworkQuestionChoice, type HomeworkEditorState, type StagedHomeworkBlock } from "./homework-editor-model";
import type { HOMEWORK_AUTHORING_BLOCK_TYPES } from "./homework-editor-model";

type HomeworkAuthoringBlockType = typeof HOMEWORK_AUTHORING_BLOCK_TYPES[number];

type HomeworkEditorContextValue = {
  state: HomeworkEditorState;
  dirty: boolean;
  sideBySideHeadingsValid: boolean;
  canCommit: boolean;
  canPublish: boolean;
  initialize: (versionId: string, blocks: HomeworkDraftBlock[], status: "draft" | "published", pages?: HomeworkEditorState["pages"]) => void;
  addPage: () => void;
  renamePage: (pageId: string, title: string) => void;
  reorderPage: (pageId: string, direction: -1 | 1) => void;
  deletePage: (pageId: string, confirmation: string) => void;
  selectPage: (pageId: string) => void;
  moveBlockToPage: (blockKey: string, pageId: string) => void;
  addBlock: (blockType: HomeworkAuthoringBlockType) => void;
  updateBlock: (key: string, update: Partial<StagedHomeworkBlock>) => void;
  addQuestionChoice: (key: string) => void;
  updateQuestionChoice: (key: string, choiceId: string, label: string) => void;
  deleteQuestionChoice: (key: string, choiceId: string) => void;
  reorderQuestionChoices: (key: string, choiceId: string, direction: -1 | 1) => void;
  reorderBlocks: (activeKey: string, overKey: string) => void;
  duplicateBlock: (key: string) => void;
  deleteBlock: (key: string, confirmation: string) => void;
  setEditingKey: (key: string | null) => void;
  finishEditing: () => void;
  cancelEditing: () => void;
  discard: () => void;
  acceptPersisted: (versionId: string, blocks: HomeworkDraftBlock[], status: "draft" | "published", pages?: HomeworkEditorState["pages"]) => void;
};

const HomeworkEditorContext = createContext<HomeworkEditorContextValue | null>(null);

export function HomeworkEditorProvider({ children, initialDraft }: { children?: ReactNode; initialDraft?: { id: string; status?: "draft" | "published"; blocks: HomeworkDraftBlock[] } }) {
  const [state, setState] = useState<HomeworkEditorState>(() => initialDraft ? homeworkEditorStateFromRows(initialDraft.id, initialDraft.blocks, initialDraft.status) : { versionId: null, versionStatus: null, blocks: [], pages: [{ id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 }], selectedPageId: "00000000-0000-4000-8000-000000000001", baseline: [], pageBaseline: [{ id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 }], deletedPageIds: [], pageDeletionConfirmed: false, editingKey: null, editingOriginal: null });
  const initialize = useCallback((versionId: string, rows: HomeworkDraftBlock[], status: "draft" | "published", pages?: HomeworkEditorState["pages"]) => {
    setState((current) => initializeHomeworkEditorState(current, versionId, rows, status, pages));
  }, []);
  const addPage = useCallback(() => setState((current) => addHomeworkPage(current)), []);
  const renamePage = useCallback((pageId: string, title: string) => setState((current) => renameHomeworkPage(current, pageId, title)), []);
  const reorderPage = useCallback((pageId: string, direction: -1 | 1) => setState((current) => reorderHomeworkPages(current, pageId, direction)), []);
  const deletePage = useCallback((pageId: string, confirmation: string) => setState((current) => deleteHomeworkPage(current, pageId, confirmation)), []);
  const selectPage = useCallback((pageId: string) => setState((current) => selectHomeworkPage(current, pageId)), []);
  const moveBlockToPage = useCallback((blockKey: string, pageId: string) => setState((current) => moveHomeworkBlockToPage(current, blockKey, pageId)), []);
  const addBlock = useCallback((blockType: HomeworkAuthoringBlockType) => {
    const block = newHomeworkBlock(blockType, 0);
    setState((current) => addHomeworkBlock(current, block));
  }, []);
  const updateBlock = useCallback((key: string, update: Partial<StagedHomeworkBlock>) => {
    setState((current) => updateHomeworkBlock(current, key, update));
  }, []);
  const addQuestionChoice = useCallback((key: string) => setState((current) => addHomeworkQuestionChoice(current, key)), []);
  const updateQuestionChoice = useCallback((key: string, choiceId: string, label: string) => setState((current) => updateHomeworkQuestionChoice(current, key, choiceId, label)), []);
  const deleteQuestionChoice = useCallback((key: string, choiceId: string) => setState((current) => deleteHomeworkQuestionChoice(current, key, choiceId)), []);
  const reorderQuestionChoices = useCallback((key: string, choiceId: string, direction: -1 | 1) => setState((current) => reorderHomeworkQuestionChoices(current, key, choiceId, direction)), []);
  const reorderBlocks = useCallback((activeKey: string, overKey: string) => {
    setState((current) => ({ ...current, blocks: reorderHomeworkBlocksOnPage(current, activeKey, overKey) }));
  }, []);
  const duplicateBlock = useCallback((key: string) => {
    const duplicateKey = `local:${crypto.randomUUID()}`;
    setState((current) => {
      const duplicated = duplicateHomeworkBlock(current.blocks, key, duplicateKey);
      return duplicated.editingKey ? { ...current, blocks: duplicated.blocks, editingKey: duplicated.editingKey, editingOriginal: null } : current;
    });
  }, []);
  const deleteBlock = useCallback((key: string, confirmation: string) => {
    setState((current) => ({ ...current, blocks: deleteHomeworkBlock(current.blocks, key, confirmation) }));
  }, []);
  const setEditingKey = useCallback((key: string | null) => setState((current) => beginHomeworkBlockEditing(current, key)), []);
  const finishEditing = useCallback(() => setState((current) => finishHomeworkBlockEditing(current)), []);
  const cancelEditing = useCallback(() => setState((current) => cancelHomeworkBlockEditing(current)), []);
  const discard = useCallback(() => setState((current) => restoreHomeworkEditorState(current)), []);
  const acceptPersisted = useCallback((versionId: string, rows: HomeworkDraftBlock[], status: "draft" | "published", pages?: HomeworkEditorState["pages"]) => {
    setState((current) => persistHomeworkEditorState(current, rows, versionId, status, pages));
  }, []);
  const value = useMemo(() => ({ state, dirty: homeworkEditorIsDirty(state), sideBySideHeadingsValid: homeworkSideBySideHeadingsAreValid(state), canCommit: homeworkEditorCanCommit(state), canPublish: homeworkPagesArePublishable(state), initialize, addPage, renamePage, reorderPage, deletePage, selectPage, moveBlockToPage, addBlock, updateBlock, addQuestionChoice, updateQuestionChoice, deleteQuestionChoice, reorderQuestionChoices, reorderBlocks, duplicateBlock, deleteBlock, setEditingKey, finishEditing, cancelEditing, discard, acceptPersisted }), [state, initialize, addPage, renamePage, reorderPage, deletePage, selectPage, moveBlockToPage, addBlock, updateBlock, addQuestionChoice, updateQuestionChoice, deleteQuestionChoice, reorderQuestionChoices, reorderBlocks, duplicateBlock, deleteBlock, setEditingKey, finishEditing, cancelEditing, discard, acceptPersisted]);
  return <HomeworkEditorContext.Provider value={value}>{children}</HomeworkEditorContext.Provider>;
}

export function useHomeworkEditorState() {
  const value = useContext(HomeworkEditorContext);
  if (!value) throw new Error("Homework editor state must be used inside HomeworkEditorProvider");
  return value;
}
