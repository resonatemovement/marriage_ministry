import { describe, expect, it } from "vitest";

import { duplicateStagedBlock, editorStateIsDirty, initialSessionEditorState, materialForRpc, moveStagedBlock, newStagedBlock, restoreSessionEditorState, sessionEditorPageIsDirty, sessionPublishError, sessionSaveError, sessionStateFromRpc, type StagedMaterialBlock } from "./editor-model";

const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lesson" }] }] };
const saved: StagedMaterialBlock = { key: "saved-id", persistedId: "saved-id", blockType: "rich_text", title: "Intro", richTextContent: richText, url: "", description: "" };
const video: StagedMaterialBlock = { key: "video-id", persistedId: "video-id", blockType: "video_link", title: "", richTextContent: null, url: "https://example.com", description: "" };

describe("unified Session editor model", () => {
  it("protects the Session page when either Session or Homework staging is dirty", () => {
    expect(sessionEditorPageIsDirty(false, false)).toBe(false);
    expect(sessionEditorPageIsDirty(true, false)).toBe(true);
    expect(sessionEditorPageIsDirty(false, true)).toBe(true);
  });

  it("starts new and persisted Sessions with a clean local baseline", () => {
    const fresh = initialSessionEditorState(null);
    expect(fresh.sessionId).toBeNull();
    expect(editorStateIsDirty(fresh, initialSessionEditorState(null))).toBe(false);
    const existing = initialSessionEditorState({ id: "session-id", sequenceNumber: 1, curriculumNumber: 1, title: "Lesson", status: "draft", updatedAt: "" }, [
      { id: "saved-id", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Intro", richTextContent: richText, url: null, description: null },
    ]);
    expect(editorStateIsDirty(existing, initialSessionEditorState({ id: "session-id", sequenceNumber: 1, curriculumNumber: 1, title: "Lesson", status: "draft", updatedAt: "" }, [
      { id: "saved-id", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Intro", richTextContent: richText, url: null, description: null },
    ]))).toBe(false);
  });

  it("detects title, content, metadata, addition, deletion, duplication and order changes without writing", () => {
    const baseline = { sessionId: "session-id", status: "draft" as const, title: "Lesson", blocks: [saved, video] };
    expect(editorStateIsDirty({ ...baseline, title: " Lesson " }, baseline)).toBe(false);
    expect(editorStateIsDirty({ ...baseline, title: "Updated" }, baseline)).toBe(true);
    expect(editorStateIsDirty({ ...baseline, blocks: [{ ...saved, title: "Edited" }, video] }, baseline)).toBe(true);
    expect(editorStateIsDirty({ ...baseline, blocks: [saved, { ...video, url: "https://other.example" }] }, baseline)).toBe(true);
    expect(editorStateIsDirty({ ...baseline, blocks: [saved] }, baseline)).toBe(true);
    const added = newStagedBlock("rich_text");
    expect(added.persistedId).toBeNull();
    expect(editorStateIsDirty({ ...baseline, blocks: [...baseline.blocks, added] }, baseline)).toBe(true);
    const duplicate = duplicateStagedBlock(baseline.blocks, saved.key);
    expect(duplicate[1].persistedId).toBeNull();
    expect(duplicate[1].key).not.toBe(saved.key);
    expect(duplicate[1].richTextContent).toEqual(saved.richTextContent);
    expect(editorStateIsDirty({ ...baseline, blocks: duplicate }, baseline)).toBe(true);
    expect(moveStagedBlock(baseline.blocks, video.key, saved.key).map((block) => block.key)).toEqual([video.key, saved.key]);
    expect(editorStateIsDirty({ ...baseline, blocks: moveStagedBlock(baseline.blocks, video.key, saved.key) }, baseline)).toBe(true);
  });

  it("restores the complete persisted baseline for local discard", () => {
    const baseline = { sessionId: "session-id", status: "draft" as const, title: "Lesson", blocks: [saved, video] };
    const changed = { ...baseline, title: "Changed", blocks: [video, { ...saved, key: "local:duplicate", persistedId: null, title: "Duplicate" }] };
    const restored = restoreSessionEditorState(baseline);
    expect(restored).toEqual(baseline);
    expect(restored).not.toBe(baseline);
    expect(editorStateIsDirty(restored, baseline)).toBe(false);
    expect(editorStateIsDirty(changed, restored)).toBe(true);
  });

  it("permits title-only Drafts and enables direct Publish only for complete local material", () => {
    const blank = initialSessionEditorState(null);
    expect(sessionSaveError(blank)).toContain("title");
    const titled = { ...blank, title: "New Session" };
    expect(sessionSaveError(titled)).toBeNull();
    expect(sessionPublishError(titled)).toContain("at least one");
    expect(sessionPublishError({ ...titled, blocks: [saved] })).toBeNull();
    expect(sessionPublishError({ ...titled, blocks: [newStagedBlock("rich_text")] })).toContain("cannot be empty");
    expect(sessionSaveError({ ...titled, blocks: [newStagedBlock("video_link")] })).toContain("valid http");
  });

  it("sends the complete ordered state with client IDs only for unsaved blocks", () => {
    const local = { ...newStagedBlock("video_link"), url: " https://example.com/new " };
    expect(materialForRpc([saved, local])).toEqual([
      { id: "saved-id", block_type: "rich_text", title: "Intro", rich_text_content: richText, url: null, description: null },
      { client_id: local.key, block_type: "video_link", title: null, rich_text_content: null, url: "https://example.com/new", description: null },
    ]);
  });

  it("adopts returned database IDs and order while retaining stable editor keys", () => {
    const local = { ...newStagedBlock("video_link"), url: "https://example.com/new" };
    const result = sessionStateFromRpc({ session_id: "session-id", status: "published", title: "Published Session", blocks: [
      { id: "new-db-id", client_id: local.key, block_type: "video_link", position: 0, title: null, rich_text_content: null, url: local.url, description: null },
      { id: "saved-id", client_id: null, block_type: "rich_text", position: 1, title: "Intro", rich_text_content: richText, url: null, description: null },
    ] }, [saved, local]);
    expect(result?.blocks.map((block) => [block.key, block.persistedId])).toEqual([[local.key, "new-db-id"], [saved.key, "saved-id"]]);
    expect(result?.status).toBe("published");
    if (!result) throw new Error("Expected a valid RPC result");
    const next = { sessionId: result.sessionId, status: result.status, title: result.title, blocks: result.blocks };
    expect(editorStateIsDirty(next, next)).toBe(false);
  });
});
