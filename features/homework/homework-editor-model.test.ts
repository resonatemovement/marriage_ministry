import { describe, expect, it } from "vitest";

import { addHomeworkBlock, deleteHomeworkBlock, duplicateHomeworkBlock, finishHomeworkBlockEditing, HOMEWORK_AUTHORING_BLOCK_TYPES, homeworkEditorIsDirty, homeworkEditorStateFromRows, homeworkMoveTarget, initializeHomeworkEditorState, newHomeworkBlock, persistHomeworkEditorState, reorderHomeworkBlocks, restoreHomeworkEditorState, updateHomeworkBlock } from "./homework-editor-model";

describe("staged Homework Rich Text model", () => {
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
    expect(HOMEWORK_AUTHORING_BLOCK_TYPES).toEqual(["rich_text", "video_link", "long_answer"]);
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
    expect(staged.editingKey).toBe(staged.blocks[0]?.key);
    expect(homeworkEditorIsDirty(staged)).toBe(true);
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
