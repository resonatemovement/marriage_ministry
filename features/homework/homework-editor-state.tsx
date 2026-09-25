"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { HomeworkDraftBlock } from "./queries";
import { addHomeworkBlock, deleteHomeworkBlock, duplicateHomeworkBlock, finishHomeworkBlockEditing, homeworkEditorIsDirty, homeworkEditorStateFromRows, initializeHomeworkEditorState, newHomeworkBlock, persistHomeworkEditorState, reorderHomeworkBlocks, restoreHomeworkEditorState, updateHomeworkBlock, type HomeworkEditorState, type StagedHomeworkBlock } from "./homework-editor-model";

type HomeworkEditorContextValue = {
  state: HomeworkEditorState;
  dirty: boolean;
  initialize: (versionId: string, blocks: HomeworkDraftBlock[], status: "draft" | "published") => void;
  addBlock: (blockType: "rich_text" | "video_link" | "long_answer") => void;
  updateBlock: (key: string, update: Partial<StagedHomeworkBlock>) => void;
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
  const addBlock = useCallback((blockType: "rich_text" | "video_link" | "long_answer") => {
    const block = newHomeworkBlock(blockType, 0);
    setState((current) => addHomeworkBlock(current, block));
  }, []);
  const updateBlock = useCallback((key: string, update: Partial<StagedHomeworkBlock>) => {
    setState((current) => updateHomeworkBlock(current, key, update));
  }, []);
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
  const value = useMemo(() => ({ state, dirty: homeworkEditorIsDirty(state), initialize, addBlock, updateBlock, reorderBlocks, duplicateBlock, deleteBlock, setEditingKey, finishEditing, discard, acceptPersisted }), [state, initialize, addBlock, updateBlock, reorderBlocks, duplicateBlock, deleteBlock, setEditingKey, finishEditing, discard, acceptPersisted]);
  return <HomeworkEditorContext.Provider value={value}>{children}</HomeworkEditorContext.Provider>;
}

export function useHomeworkEditorState() {
  const value = useContext(HomeworkEditorContext);
  if (!value) throw new Error("Homework editor state must be used inside HomeworkEditorProvider");
  return value;
}
