"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { HomeworkDraftBlock } from "./queries";
import { addHomeworkBlock, addHomeworkQuestionChoice, deleteHomeworkBlock, deleteHomeworkQuestionChoice, duplicateHomeworkBlock, finishHomeworkBlockEditing, homeworkEditorIsDirty, homeworkEditorStateFromRows, initializeHomeworkEditorState, newHomeworkBlock, persistHomeworkEditorState, reorderHomeworkBlocks, reorderHomeworkQuestionChoices, restoreHomeworkEditorState, updateHomeworkBlock, updateHomeworkQuestionChoice, type HomeworkEditorState, type StagedHomeworkBlock } from "./homework-editor-model";
import type { HOMEWORK_AUTHORING_BLOCK_TYPES } from "./homework-editor-model";

type HomeworkAuthoringBlockType = typeof HOMEWORK_AUTHORING_BLOCK_TYPES[number];

type HomeworkEditorContextValue = {
  state: HomeworkEditorState;
  dirty: boolean;
  initialize: (versionId: string, blocks: HomeworkDraftBlock[], status: "draft" | "published") => void;
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
  discard: () => void;
  acceptPersisted: (versionId: string, blocks: HomeworkDraftBlock[], status: "draft" | "published") => void;
};

const HomeworkEditorContext = createContext<HomeworkEditorContextValue | null>(null);

export function HomeworkEditorProvider({ children, initialDraft }: { children?: ReactNode; initialDraft?: { id: string; status?: "draft" | "published"; blocks: HomeworkDraftBlock[] } }) {
  const [state, setState] = useState<HomeworkEditorState>(() => initialDraft ? homeworkEditorStateFromRows(initialDraft.id, initialDraft.blocks, initialDraft.status) : { versionId: null, versionStatus: null, blocks: [], baseline: [], editingKey: null });
  const initialize = useCallback((versionId: string, rows: HomeworkDraftBlock[], status: "draft" | "published") => {
    setState((current) => initializeHomeworkEditorState(current, versionId, rows, status));
  }, []);
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
    setState((current) => ({ ...current, blocks: reorderHomeworkBlocks(current.blocks, activeKey, overKey) }));
  }, []);
  const duplicateBlock = useCallback((key: string) => {
    const duplicateKey = `local:${crypto.randomUUID()}`;
    setState((current) => {
      const duplicated = duplicateHomeworkBlock(current.blocks, key, duplicateKey);
      return duplicated.editingKey ? { ...current, blocks: duplicated.blocks, editingKey: duplicated.editingKey } : current;
    });
  }, []);
  const deleteBlock = useCallback((key: string, confirmation: string) => {
    setState((current) => ({ ...current, blocks: deleteHomeworkBlock(current.blocks, key, confirmation) }));
  }, []);
  const setEditingKey = useCallback((key: string | null) => setState((current) => ({ ...current, editingKey: key })), []);
  const finishEditing = useCallback(() => setState((current) => finishHomeworkBlockEditing(current)), []);
  const discard = useCallback(() => setState((current) => restoreHomeworkEditorState(current)), []);
  const acceptPersisted = useCallback((versionId: string, rows: HomeworkDraftBlock[], status: "draft" | "published") => {
    setState((current) => persistHomeworkEditorState(current, rows, versionId, status));
  }, []);
  const value = useMemo(() => ({ state, dirty: homeworkEditorIsDirty(state), initialize, addBlock, updateBlock, addQuestionChoice, updateQuestionChoice, deleteQuestionChoice, reorderQuestionChoices, reorderBlocks, duplicateBlock, deleteBlock, setEditingKey, finishEditing, discard, acceptPersisted }), [state, initialize, addBlock, updateBlock, addQuestionChoice, updateQuestionChoice, deleteQuestionChoice, reorderQuestionChoices, reorderBlocks, duplicateBlock, deleteBlock, setEditingKey, finishEditing, discard, acceptPersisted]);
  return <HomeworkEditorContext.Provider value={value}>{children}</HomeworkEditorContext.Provider>;
}

export function useHomeworkEditorState() {
  const value = useContext(HomeworkEditorContext);
  if (!value) throw new Error("Homework editor state must be used inside HomeworkEditorProvider");
  return value;
}
