import { describe, expect, it } from "vitest";
import { sideBySideResponseMetadata } from "./side-by-side-response";

import { addHomeworkBlock, addHomeworkPage, addHomeworkQuestionChoice, beginHomeworkBlockEditing, cancelHomeworkBlockEditing, deleteHomeworkBlock, deleteHomeworkPage, deleteHomeworkQuestionChoice, duplicateHomeworkBlock, finishHomeworkBlockEditing, HOMEWORK_AUTHORING_BLOCK_TYPES, homeworkBlockIsComplete, homeworkEditorCanCommit, homeworkEditorIsDirty, homeworkEditorStateFromRows, homeworkMoveTarget, homeworkPagesArePublishable, homeworkSideBySideHeadingsAreValid, initializeHomeworkEditorState, moveHomeworkBlockToPage, newHomeworkBlock, persistHomeworkEditorState, reorderHomeworkBlocks, reorderHomeworkPages, reorderHomeworkQuestionChoices, renameHomeworkPage, restoreHomeworkEditorState, selectHomeworkPage, sideBySideHeadingsAreValid, updateHomeworkBlock, updateHomeworkQuestionChoice } from "./homework-editor-model";

describe("staged Homework Rich Text model", () => {
  it("adds, renames, reorders, moves, and permanently deletes draft pages without changing block identity", () => {
    const firstPage = { id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 };
    const initial = homeworkEditorStateFromRows("draft-id", [{ id: "snapshot-a", homeworkBlockId: "block-a", blockType: "long_answer", position: 0, title: "Prompt", richTextContent: { type: "doc", content: [] }, url: null, description: null, pageId: firstPage.id }], "draft", [firstPage]);
    const added = addHomeworkPage(initial, { id: "00000000-0000-4000-8000-000000000002", title: "", position: 1 });
    expect(added.selectedPageId).toBe("00000000-0000-4000-8000-000000000002");
    expect(homeworkPagesArePublishable(added)).toBe(false);
    const named = renameHomeworkPage(added, added.selectedPageId, "Reflection");
    const moved = moveHomeworkBlockToPage(named, "snapshot-a", added.selectedPageId);
    expect(moved.blocks[0]).toMatchObject({ persistedId: "snapshot-a", homeworkBlockId: "block-a", pageId: added.selectedPageId });
    expect(reorderHomeworkPages(moved, added.selectedPageId, -1).pages.map((page) => page.title)).toEqual(["Reflection", "Page 1"]);
    const deleted = deleteHomeworkPage(moved, added.selectedPageId, "DELETE");
    expect(deleted.pages).toHaveLength(1);
    expect(deleted.blocks).toHaveLength(0);
    expect(deleteHomeworkPage(moved, added.selectedPageId, "delete")).toBe(moved);
  });

  it("keeps legacy snapshots on one implicit page and requires titled nonempty pages only for publication", () => {
    const legacy = homeworkEditorStateFromRows("legacy-version", [{ id: "snapshot", homeworkBlockId: "logical", blockType: "long_answer", position: 0, title: "Prompt", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Answer this" }] }] }, url: null, description: null }], "published");
    expect(legacy.pages).toEqual([{ id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 }]);
    expect(legacy.blocks[0]?.pageId).toBe(legacy.pages[0]?.id);
    expect(homeworkPagesArePublishable(legacy)).toBe(true);
    const incomplete = addHomeworkPage(legacy, { id: "00000000-0000-4000-8000-000000000002", title: "", position: 1 });
    expect(homeworkEditorCanCommit(incomplete)).toBe(true);
    expect(homeworkPagesArePublishable(incomplete)).toBe(false);
    expect(homeworkPagesArePublishable(renameHomeworkPage(incomplete, incomplete.selectedPageId, "Second"))).toBe(false);
  });

  it("switches selected pages without resetting staged blocks or edits", () => {
    const pageOne = { id: "page-one", title: "Reflection", position: 0 };
    const pageTwo = { id: "page-two", title: "Practice", position: 1 };
    const initial = homeworkEditorStateFromRows("draft-id", [{
      id: "snapshot-a", homeworkBlockId: "block-a", blockType: "long_answer", position: 0,
      title: "Question", richTextContent: { type: "doc", content: [] }, url: null, description: null,
    }], "draft", [pageOne, pageTwo]);
    const edited = updateHomeworkBlock(initial, "snapshot-a", { title: "Unsaved title" });

    const secondPage = selectHomeworkPage(edited, pageTwo.id);
    expect(secondPage.selectedPageId).toBe(pageTwo.id);
    expect(secondPage.blocks).toBe(edited.blocks);
    expect(secondPage.blocks[0]?.title).toBe("Unsaved title");
    expect(selectHomeworkPage(secondPage, pageOne.id).blocks[0]?.title).toBe("Unsaved title");
    expect(selectHomeworkPage(secondPage, "missing-page")).toBe(secondPage);
  });

  it("loads persisted block IDs and retains unsupported future block types", () => {
    const state = homeworkEditorStateFromRows("draft-id", [
      { id: "version-block-1", homeworkBlockId: "block-1", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [] }, url: null, description: null },
      { id: "version-block-2", homeworkBlockId: "block-2", blockType: "long_answer", position: 1, title: "Question", richTextContent: { type: "doc", content: [] }, url: null, description: null },
    ]);
    expect(state.blocks.map(({ persistedId, homeworkBlockId, blockType }) => [persistedId, homeworkBlockId, blockType])).toEqual([
      ["version-block-1", "block-1", "rich_text"], ["version-block-2", "block-2", "long_answer"],
    ]);
    expect(state.blocks).toEqual(state.baseline);
    expect(homeworkEditorIsDirty(state)).toBe(false);
    expect(HOMEWORK_AUTHORING_BLOCK_TYPES).toEqual(["rich_text", "video_link", "long_answer", "checkbox_question", "radio_question", "side_by_side_response"]);
    expect(state.blocks[0]?.isRequired).toBe(true);
  });

  it("creates, edits, duplicates, and restores Side-by-Side blocks by stable response identities rather than headings", () => {
    const initial = homeworkEditorStateFromRows("draft", []);
    const created = newHomeworkBlock("side_by_side_response", 0);
    expect(created.sideBySideConfig).toMatchObject({ leftHeading: "", rightHeading: "", bothRequired: true, responseMode: "paired_rows_v1" });
    expect(sideBySideHeadingsAreValid(created.sideBySideConfig)).toBe(false);
    const valid = updateHomeworkBlock(addHomeworkBlock(initial, created), created.key, { sideBySideConfig: { ...created.sideBySideConfig!, leftHeading: "Left", rightHeading: "Right" } });
    expect(homeworkSideBySideHeadingsAreValid(valid)).toBe(true);
    const staged = addHomeworkBlock(initial, created);
    const edited = updateHomeworkBlock(staged, created.key, { sideBySideConfig: { ...created.sideBySideConfig!, leftHeading: "Changed heading" } });
    expect(homeworkEditorIsDirty(edited)).toBe(true);
    const duplicate = duplicateHomeworkBlock(edited.blocks, created.key);
    expect(duplicate.blocks[1]?.sideBySideConfig?.groupId).not.toBe(created.sideBySideConfig?.groupId);

    const config = { ...created.sideBySideConfig!, instructions: "Describe your reflection.", leftHeading: "Left", rightHeading: "Right" };
    const left = { id: "left-snapshot", homeworkBlockId: "left-logical", blockType: "long_answer", position: 0, title: config.leftHeading, richTextContent: { type: "doc", content: [] }, url: null, description: sideBySideResponseMetadata({ ...config, side: "left" as const }) };
    const right = { id: "right-snapshot", homeworkBlockId: "right-logical", blockType: "long_answer", position: 1, title: config.rightHeading, richTextContent: { type: "doc", content: [] }, url: null, description: sideBySideResponseMetadata({ ...config, side: "right" as const }) };
    const restored = homeworkEditorStateFromRows("draft", [left, right]);
    expect(restored.blocks).toHaveLength(1);
    expect(restored.blocks[0]).toMatchObject({ blockType: "side_by_side_response", sideBySideConfig: config,
      sideBySideResponseIds: { left: { snapshotId: "left-snapshot", homeworkBlockId: "left-logical" }, right: { snapshotId: "right-snapshot", homeworkBlockId: "right-logical" } } });
    const updatedConfig = { ...config, rightHeading: "Changed heading" };
    const changedHeading = homeworkEditorStateFromRows("draft", [
      { ...left, description: sideBySideResponseMetadata({ ...updatedConfig, side: "left" as const }) },
      { ...right, title: "Changed heading", description: sideBySideResponseMetadata({ ...updatedConfig, side: "right" as const }) },
    ]);
    expect(changedHeading.blocks[0]?.sideBySideResponseIds?.left.snapshotId).toBe("left-snapshot");
    expect(changedHeading.blocks[0]?.sideBySideResponseIds?.right.snapshotId).toBe("right-snapshot");
    expect(homeworkEditorIsDirty(restored)).toBe(false);
  });

  it.each(HOMEWORK_AUTHORING_BLOCK_TYPES)("adds a local %s block with the database-compatible shape", (type) => {
    const initial = homeworkEditorStateFromRows("draft-id", []);
    const block = newHomeworkBlock(type, 0);
    const staged = addHomeworkBlock(initial, block);
    expect(staged.blocks).toHaveLength(1);
    expect(staged.blocks[0]?.key).toMatch(/^local:/);
    expect(staged.blocks[0]?.persistedId).toBeNull();
    expect(staged.blocks[0]?.homeworkBlockId).toBeNull();
    expect(staged.blocks[0]?.blockType).toBe(type);
    expect(staged.blocks[0]?.richTextContent !== null).toBe(type !== "video_link");
    expect(staged.blocks[0]?.url).toBe(type === "video_link" ? "" : null);
    if (type === "checkbox_question" || type === "radio_question") {
      expect(staged.blocks[0]?.questionChoices).toHaveLength(2);
      expect(staged.blocks[0]?.questionChoices.every(({ label }) => label === "")).toBe(true);
      expect(new Set(staged.blocks[0]?.questionChoices.map(({ id }) => id)).size).toBe(2);
      expect(staged.blocks[0]?.isRequired).toBe(true);
    }
    expect(staged.editingKey).toBe(staged.blocks[0]?.key);
    expect(homeworkEditorIsDirty(staged)).toBe(true);
  });

  it("manages choice labels/order immutably with stable IDs and tracks required changes as dirty", () => {
    const initial = homeworkEditorStateFromRows("draft-id", []);
    const created = newHomeworkBlock("checkbox_question", 0);
    const baseline = addHomeworkBlock(initial, created);
    const questionText = updateHomeworkBlock(baseline, created.key, { richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Question text" }] }] } });
    const originalIds = baseline.blocks[0]!.questionChoices.map(({ id }) => id);
    const withChoice = addHomeworkQuestionChoice(questionText, created.key);
    const thirdId = withChoice.blocks[0]!.questionChoices[2]!.id;
    expect(thirdId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(withChoice.blocks[0]!.questionChoices.slice(0, 2).map(({ id }) => id)).toEqual(originalIds);

    const labeled = updateHomeworkQuestionChoice(withChoice, created.key, originalIds[0]!, "First answer");
    expect(labeled.blocks[0]!.questionChoices[0]).toEqual({ id: originalIds[0], label: "First answer" });
    const reordered = reorderHomeworkQuestionChoices(labeled, created.key, originalIds[0]!, 1);
    expect(reordered.blocks[0]!.questionChoices.map(({ id }) => id)).toEqual([originalIds[1], originalIds[0], thirdId]);
    const removed = deleteHomeworkQuestionChoice(reordered, created.key, thirdId);
    expect(removed.blocks[0]!.questionChoices.map(({ id }) => id)).toEqual([originalIds[1], originalIds[0]]);
    expect(homeworkEditorIsDirty(removed)).toBe(true);
    const optional = updateHomeworkBlock(removed, created.key, { isRequired: false });
    expect(optional.blocks[0]!.isRequired).toBe(false);
    expect(homeworkEditorIsDirty(optional)).toBe(true);
    expect(baseline.blocks[0]!.questionChoices.map(({ id }) => id)).toEqual(originalIds);
    expect(baseline.blocks[0]!.questionChoices.every(({ label }) => label === "")).toBe(true);
    expect(questionText.blocks[0]!.richTextContent).toMatchObject({ content: [{ content: [{ text: "Question text" }] }] });
  });

  it("duplicates selection-question copy and order with new choice IDs while leaving the source untouched", () => {
    const source = newHomeworkBlock("checkbox_question", 0);
    const state = addHomeworkBlock(homeworkEditorStateFromRows("draft-id", []), source);
    const choices = source.questionChoices.map((choice, index) => ({ ...choice, label: `Choice ${index + 1}` }));
    const prepared = updateHomeworkBlock(state, source.key, { richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Choose all" }] }] }, questionChoices: choices, isRequired: false });
    const duplicated = duplicateHomeworkBlock(prepared.blocks, source.key);
    const original = duplicated.blocks[0]!;
    const copy = duplicated.blocks[1]!;

    expect(copy).toMatchObject({ blockType: "checkbox_question", isRequired: false, richTextContent: original.richTextContent });
    expect(copy.questionChoices.map(({ label }) => label)).toEqual(["Choice 1", "Choice 2"]);
    expect(copy.questionChoices.map(({ id }) => id)).not.toEqual(choices.map(({ id }) => id));
    expect(new Set(copy.questionChoices.map(({ id }) => id)).size).toBe(2);
    expect(original.questionChoices).toEqual(choices);
  });

  it.each(["checkbox_question", "radio_question"] as const)("rehydrates saved %s choices and requiredness without marking the editor dirty", (blockType) => {
    const choices = [{ id: "a8c2aa25-80e6-4bd0-b4f9-9a4f04bd79d2", label: "Choice A" }, { id: "c79dc958-ea2a-47f2-9a4e-0c0e40dcc94c", label: "Choice B" }];
    const saved = homeworkEditorStateFromRows("draft-id", [{ id: "snapshot", homeworkBlockId: "logical", blockType, position: 0,
      title: null, richTextContent: { type: "doc", content: [] }, url: null, description: null, questionChoices: choices, isRequired: false }]);
    expect(saved.blocks[0]).toMatchObject({ questionChoices: choices, isRequired: false });
    expect(homeworkEditorIsDirty(saved)).toBe(false);
    const next = persistHomeworkEditorState(saved, [{ id: "snapshot", homeworkBlockId: "logical", blockType, position: 0,
      title: null, richTextContent: { type: "doc", content: [] }, url: null, description: null, questionChoices: choices, isRequired: false }], "draft-id", "draft");
    expect(next.blocks[0]).toMatchObject({ questionChoices: choices, isRequired: false });
    expect(homeworkEditorIsDirty(next)).toBe(false);
  });

  it("stages edits locally, allows one active editor, and Done exits editing without clearing dirty state", () => {
    const clean = homeworkEditorStateFromRows("draft-id", []);
    const first = newHomeworkBlock("rich_text", 0);
    const withFirst = addHomeworkBlock(clean, first);
    const updated = updateHomeworkBlock(withFirst, first.key, { title: "Staged", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Local" }] }] } });
    const second = newHomeworkBlock("long_answer", 1);
    const withSecond = addHomeworkBlock(updated, second);
    expect(withSecond.editingKey).toBe(second.key);
    expect(withSecond.blocks[0]?.title).toBe("Staged");
    const done = finishHomeworkBlockEditing(withSecond);
    expect(done.editingKey).toBeNull();
    expect(homeworkEditorIsDirty(done)).toBe(true);
    expect(done.blocks).toEqual(withSecond.blocks);
    expect(homeworkEditorCanCommit(withSecond)).toBe(false);
    expect(homeworkEditorCanCommit(done)).toBe(false);
  });

  it("cancels only the active persisted block edit and removes an unconfirmed new block", () => {
    const baseline = homeworkEditorStateFromRows("draft-id", [
      { id: "snapshot-a", homeworkBlockId: "logical-a", blockType: "rich_text", position: 0, title: "Saved", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved body" }] }] }, url: null, description: null },
      { id: "snapshot-b", homeworkBlockId: "logical-b", blockType: "long_answer", position: 1, title: "Question", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Explain" }] }] }, url: null, description: null },
    ]);
    const changed = updateHomeworkBlock(beginHomeworkBlockEditing(baseline, "snapshot-a"), "snapshot-a", { title: "Unconfirmed" });
    const canceled = cancelHomeworkBlockEditing(changed);
    expect(canceled.blocks.map(({ title }) => title)).toEqual(["Saved", "Question"]);
    expect(canceled.editingKey).toBeNull();
    expect(homeworkEditorIsDirty(canceled)).toBe(false);

    const added = addHomeworkBlock(baseline, newHomeworkBlock("rich_text", 2));
    const canceledNew = cancelHomeworkBlockEditing(added);
    expect(canceledNew.blocks.map(({ key }) => key)).toEqual(baseline.blocks.map(({ key }) => key));
    expect(homeworkEditorIsDirty(canceledNew)).toBe(false);
  });

  it("requires valid fields across all block types before Done or a global save can proceed", () => {
    const validRich = { ...newHomeworkBlock("rich_text", 0), title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Read this" }] }] } };
    const validLongAnswer = { ...newHomeworkBlock("long_answer", 0), richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Reflect" }] }] } };
    const validVideo = { ...newHomeworkBlock("video_link", 0), title: "Video", url: "https://example.com/video", description: "Watch this" };
    const validChoice = { ...newHomeworkBlock("checkbox_question", 0), richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Choose" }] }] }, questionChoices: [
      { id: "a8c2aa25-80e6-4bd0-b4f9-9a4f04bd79d2", label: "One" }, { id: "c79dc958-ea2a-47f2-9a4e-0c0e40dcc94c", label: "Two" },
    ] };
    const validPair = { ...newHomeworkBlock("side_by_side_response", 0), sideBySideConfig: { ...newHomeworkBlock("side_by_side_response", 0).sideBySideConfig!, leftHeading: "Recognize", rightHeading: "Renounce" } };
    expect([validRich, validLongAnswer, validVideo, validChoice, validPair].every(homeworkBlockIsComplete)).toBe(true);
    expect(homeworkBlockIsComplete(newHomeworkBlock("checkbox_question", 0))).toBe(false);
    expect(homeworkBlockIsComplete({ ...validChoice, questionChoices: [{ ...validChoice.questionChoices[0]!, label: " " }, validChoice.questionChoices[1]!] })).toBe(false);
    expect(homeworkBlockIsComplete({ ...validPair, sideBySideConfig: { ...validPair.sideBySideConfig!, rightHeading: "  " } })).toBe(false);

    const validState = finishHomeworkBlockEditing(addHomeworkBlock(homeworkEditorStateFromRows("draft-id", []), validPair));
    expect(homeworkEditorCanCommit(validState)).toBe(true);
    expect(homeworkEditorCanCommit({ ...validState, editingKey: validState.blocks[0]!.key })).toBe(false);
  });

  it.each(["video_link", "long_answer"] as const)("keeps staged %s values on Done without changing persisted identities", (type) => {
    const clean = homeworkEditorStateFromRows("draft-id", []);
    const added = addHomeworkBlock(clean, newHomeworkBlock(type, 0));
    const local = added.blocks[0]!;
    const updated = updateHomeworkBlock(added, local.key, type === "video_link"
      ? { title: "Watch", url: "https://example.com/video", description: "Watch first" }
      : { title: "Question", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Explain" }] }] } });
    const done = finishHomeworkBlockEditing(updated);

    expect(done.editingKey).toBeNull();
    expect(done.blocks[0]).toMatchObject({ key: local.key, persistedId: null, homeworkBlockId: null, blockType: type });
    expect(done.blocks[0]?.title).toBe(type === "video_link" ? "Watch" : "Question");
    expect(homeworkEditorIsDirty(done)).toBe(true);
  });

  it("keeps local blocks when the same Homework workspace is initialized again", () => {
    const clean = homeworkEditorStateFromRows("draft-id", []);
    const staged = HOMEWORK_AUTHORING_BLOCK_TYPES.reduce((current, type) => addHomeworkBlock(current, newHomeworkBlock(type, current.blocks.length)), clean);
    const resumed = initializeHomeworkEditorState(staged, "draft-id", []);
    expect(resumed).toBe(staged);
    expect(resumed.blocks).toEqual(staged.blocks);
    expect(homeworkEditorIsDirty(resumed)).toBe(true);
    expect(resumed.blocks.map((block) => block.blockType)).toEqual(HOMEWORK_AUTHORING_BLOCK_TYPES);
  });

  it("reconciles saved local IDs into a clean baseline and keeps Published/Draft context", () => {
    const local = newHomeworkBlock("long_answer", 0);
    const staged = addHomeworkBlock(homeworkEditorStateFromRows("published-id", [], "published"), local);
    const saved = persistHomeworkEditorState(staged, [{
      id: "snapshot-id", homeworkBlockId: "logical-id", blockType: "long_answer", position: 0,
      title: "Question", richTextContent: { type: "doc", content: [] }, url: null, description: null, clientId: local.key,
    }], "draft-id", "draft");
    expect(saved.versionId).toBe("draft-id");
    expect(saved.versionStatus).toBe("draft");
    expect(saved.blocks[0]).toMatchObject({ key: local.key, persistedId: "snapshot-id", homeworkBlockId: "logical-id" });
    expect(saved.blocks).toEqual(saved.baseline);
    expect(homeworkEditorIsDirty(saved)).toBe(false);
  });

  it("discards only Homework local state back to its own persisted baseline", () => {
    const baseline = homeworkEditorStateFromRows("draft-id", [{
      id: "snapshot-id", homeworkBlockId: "logical-id", blockType: "rich_text", position: 0,
      title: "Saved", richTextContent: { type: "doc", content: [] }, url: null, description: null,
    }]);
    const changed = updateHomeworkBlock(baseline, "snapshot-id", { title: "Local edit" });
    const restored = restoreHomeworkEditorState(changed);
    expect(restored.blocks[0]?.title).toBe("Saved");
    expect(homeworkEditorIsDirty(restored)).toBe(false);
    expect(changed.blocks[0]?.title).toBe("Local edit");
  });

  it("reorders staged blocks, normalizes positions, preserves identities and content, and Discard restores baseline order", () => {
    const baseline = homeworkEditorStateFromRows("draft-id", [
      { id: "snapshot-a", homeworkBlockId: "logical-a", blockType: "rich_text", position: 0, title: "A", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }] }, url: null, description: null },
      { id: "snapshot-b", homeworkBlockId: "logical-b", blockType: "video_link", position: 1, title: "B", richTextContent: null, url: "https://example.com/b", description: "B description" },
      { id: "snapshot-c", homeworkBlockId: "logical-c", blockType: "long_answer", position: 2, title: "C", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Gamma" }] }] }, url: null, description: null },
    ]);
    const reordered = { ...baseline, blocks: reorderHomeworkBlocks(baseline.blocks, "snapshot-c", "snapshot-a") };
    expect(reordered.blocks.map(({ key, position }) => [key, position])).toEqual([["snapshot-c", 0], ["snapshot-a", 1], ["snapshot-b", 2]]);
    expect(reordered.blocks.map(({ persistedId, homeworkBlockId }) => [persistedId, homeworkBlockId])).toEqual([["snapshot-c", "logical-c"], ["snapshot-a", "logical-a"], ["snapshot-b", "logical-b"]]);
    expect(reordered.blocks[1]?.richTextContent).toEqual(baseline.blocks[0]?.richTextContent);
    expect(homeworkEditorIsDirty(reordered)).toBe(true);
    expect(initializeHomeworkEditorState(reordered, "draft-id", [])).toBe(reordered);
    const restored = restoreHomeworkEditorState(reordered);
    expect(restored.blocks.map((block) => block.key)).toEqual(["snapshot-a", "snapshot-b", "snapshot-c"]);
    expect(homeworkEditorIsDirty(restored)).toBe(false);
  });

  it("selects adjacent Move Up/Down targets and uses the same reorder operation as drag/drop", () => {
    const state = homeworkEditorStateFromRows("draft-id", [
      { id: "snapshot-a", homeworkBlockId: "logical-a", blockType: "rich_text", position: 0, title: "A", richTextContent: { type: "doc", content: [] }, url: null, description: null },
      { id: "snapshot-b", homeworkBlockId: "logical-b", blockType: "video_link", position: 1, title: "B", richTextContent: null, url: "https://example.com", description: "B" },
      { id: "snapshot-c", homeworkBlockId: "logical-c", blockType: "long_answer", position: 2, title: "C", richTextContent: { type: "doc", content: [] }, url: null, description: null },
    ]);
    const [first, middle, last] = state.blocks;
    expect(homeworkMoveTarget(state.blocks, first!.key, -1)).toBeNull();
    expect(homeworkMoveTarget(state.blocks, middle!.key, -1)).toBe(first!.key);
    expect(homeworkMoveTarget(state.blocks, middle!.key, 1)).toBe(last!.key);
    expect(homeworkMoveTarget(state.blocks, last!.key, 1)).toBeNull();

    const movedUp = reorderHomeworkBlocks(state.blocks, middle!.key, homeworkMoveTarget(state.blocks, middle!.key, -1)!);
    expect(movedUp.map(({ key, position }) => [key, position])).toEqual([[middle!.key, 0], [first!.key, 1], [last!.key, 2]]);
    expect(movedUp.map(({ key, persistedId, homeworkBlockId, url, description }) => [key, persistedId, homeworkBlockId, url, description])).toEqual([
      [middle!.key, middle!.persistedId, middle!.homeworkBlockId, middle!.url, middle!.description],
      [first!.key, first!.persistedId, first!.homeworkBlockId, first!.url, first!.description],
      [last!.key, last!.persistedId, last!.homeworkBlockId, last!.url, last!.description],
    ]);
    expect(homeworkEditorIsDirty({ ...state, blocks: movedUp })).toBe(true);

    const movedDown = reorderHomeworkBlocks(state.blocks, middle!.key, homeworkMoveTarget(state.blocks, middle!.key, 1)!);
    expect(movedDown.map(({ key, position }) => [key, position])).toEqual([[first!.key, 0], [last!.key, 1], [middle!.key, 2]]);
    expect(homeworkEditorIsDirty({ ...state, blocks: movedDown })).toBe(true);
    const restored = restoreHomeworkEditorState({ ...state, blocks: movedDown });
    expect(restored.blocks.map((block) => block.key)).toEqual(state.blocks.map((block) => block.key));
    expect(homeworkEditorIsDirty(restored)).toBe(false);
  });

  it.each(HOMEWORK_AUTHORING_BLOCK_TYPES)("duplicates %s immediately after its source with fresh logical identity", (type) => {
    const row = { id: "snapshot-original", homeworkBlockId: "logical-original", blockType: type, position: 0,
      title: "Original", richTextContent: type === "video_link" ? null : { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Copied content" }] }] },
      url: type === "video_link" ? "https://example.com" : null, description: type === "video_link" ? "Copied description" : null };
    const baseline = homeworkEditorStateFromRows("draft-id", [row, { ...row, id: "snapshot-next", homeworkBlockId: "logical-next", position: 1, title: "Next" }]);
    const duplicated = duplicateHomeworkBlock(baseline.blocks, "snapshot-original");
    const copy = duplicated.blocks[1]!;
    expect(duplicated.blocks.map(({ key, position }) => [key, position])).toEqual([["snapshot-original", 0], [copy.key, 1], ["snapshot-next", 2]]);
    expect(copy).toMatchObject({ blockType: type, title: "Original", key: expect.stringMatching(/^local:/), persistedId: null, homeworkBlockId: null, url: row.url, description: row.description });
    expect(copy.richTextContent).toEqual(row.richTextContent);
    if (row.richTextContent) expect(copy.richTextContent).not.toBe(row.richTextContent);
    expect(duplicated.editingKey).toBe(copy.key);
    expect(homeworkEditorIsDirty({ ...baseline, blocks: duplicated.blocks, editingKey: duplicated.editingKey })).toBe(true);
    const restored = restoreHomeworkEditorState({ ...baseline, blocks: duplicated.blocks, editingKey: duplicated.editingKey });
    expect(restored.blocks).toEqual(baseline.blocks);
    expect(homeworkEditorIsDirty(restored)).toBe(false);
  });

  it("deletes persisted and local supported blocks only from staged state and Discard restores persisted blocks", () => {
    const baseline = homeworkEditorStateFromRows("draft-id", [
      { id: "snapshot-a", homeworkBlockId: "logical-a", blockType: "video_link", position: 0, title: "A", richTextContent: null, url: "https://example.com/a", description: "A" },
      { id: "snapshot-b", homeworkBlockId: "logical-b", blockType: "long_answer", position: 1, title: "B", richTextContent: { type: "doc", content: [] }, url: null, description: null },
    ]);
    expect(deleteHomeworkBlock(baseline.blocks, "snapshot-a", "DELETE ")).toBe(baseline.blocks);
    expect(deleteHomeworkBlock(baseline.blocks, "snapshot-a", "delete")).toBe(baseline.blocks);
    const afterDelete = deleteHomeworkBlock(baseline.blocks, "snapshot-a", "DELETE");
    const deletedState = { ...baseline, blocks: afterDelete };
    expect(afterDelete.map(({ key, position }) => [key, position])).toEqual([["snapshot-b", 0]]);
    expect(homeworkEditorIsDirty(deletedState)).toBe(true);
    const restored = restoreHomeworkEditorState(deletedState);
    expect(restored.blocks).toEqual(baseline.blocks);
    expect(homeworkEditorIsDirty(restored)).toBe(false);

    const local = addHomeworkBlock(baseline, newHomeworkBlock("rich_text", 2));
    const withoutLocal = { ...local, blocks: deleteHomeworkBlock(local.blocks, local.editingKey!, "DELETE") };
    expect(withoutLocal.blocks.map((block) => [block.key, block.position])).toEqual([["snapshot-a", 0], ["snapshot-b", 1]]);
    expect(withoutLocal.blocks.some((block) => block.key.startsWith("local:"))).toBe(false);
  });

  it("does not duplicate or delete unsupported preserved blocks", () => {
    const blocks = homeworkEditorStateFromRows("draft-id", [{ id: "future", homeworkBlockId: "logical-future", blockType: "future_type", position: 0, title: "Future", richTextContent: null, url: null, description: null }]).blocks;
    expect(duplicateHomeworkBlock(blocks, "future").blocks).toBe(blocks);
    expect(deleteHomeworkBlock(blocks, "future", "DELETE")).toBe(blocks);
  });
});
