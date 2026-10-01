import { describe, expect, it } from "vitest";

import { duplicateStagedBlock, editorStateIsDirty, initialSessionEditorState, libraryResourceBlockIsComplete, materialForRpc, moveStagedBlock, moveStagedBlockWithinType, newLibraryResourceBlock, newStagedBlock, removeStagedBlock, restoreSessionEditorState, selectLibraryResource, sessionEditorPageIsDirty, sessionPublishError, sessionSaveError, sessionStateFromRpc, type StagedMaterialBlock } from "./editor-model";
import type { ResourceLibraryItem } from "@/features/resource-library/presentation";

const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Lesson" }] }] };
const saved: StagedMaterialBlock = { key: "saved-id", persistedId: "saved-id", blockType: "rich_text", title: "Intro", richTextContent: richText, url: "", description: "" };
const video: StagedMaterialBlock = { key: "video-id", persistedId: "video-id", blockType: "video_link", title: "", richTextContent: null, url: "https://example.com", description: "" };

describe("unified Session editor model", () => {
  it("stages a library Resource with stable identity, shared ordering, duplicate and discard", () => {
    const resource: ResourceLibraryItem = { id: "resource-id", title: "File", description: "Canonical", category: "document", archivedAt: null,
      createdAt: "", updatedAt: "", canManage: false, currentVersion: { originalFilename: "file.pdf", mimeType: "application/pdf", sizeBytes: 42, uploadedAt: "" }, previewUrl: null };
    const library = selectLibraryResource(newLibraryResourceBlock("document"), resource);
    const baseline = { sessionId: "session-id", status: "draft" as const, title: "Lesson", blocks: [video] };
    const staged = { ...baseline, blocks: [...baseline.blocks, library] };
    expect(library.blockType).toBe("library_resource");
    expect(library.resourceId).toBe(resource.id);
    expect(editorStateIsDirty(staged, baseline)).toBe(true);
    const serialized = materialForRpc(staged.blocks);
    expect(Array.isArray(serialized) ? serialized[1] : null).toMatchObject({ block_type: "library_resource", resource_id: "resource-id", resource_category: "document" });
    const reordered = moveStagedBlockWithinType(staged.blocks, "library_resource", library.key, video.key);
    expect(reordered.map((block) => block.key)).toEqual([library.key, video.key]);
    const duplicated = duplicateStagedBlock(staged.blocks, library.key);
    expect(duplicated[2].resourceId).toBe(resource.id);
    expect(duplicated[2].key).not.toBe(library.key);
    expect(restoreSessionEditorState(baseline)).toEqual(baseline);
    expect(sessionPublishError({ ...baseline, blocks: [library] })).toBeNull();
    expect(sessionSaveError({ ...baseline, blocks: [{ ...library, resourceId: null }] })).toContain("Select a Resource");
    const persisted = sessionStateFromRpc({ session_id: "session-id", status: "draft", title: "Lesson", blocks: [{
      id: "new-block-id", client_id: library.key, block_type: "library_resource", position: 0,
      title: null, rich_text_content: null, url: null, description: null,
      resource_id: resource.id, resource_category: resource.category,
    }] }, [library]);
    expect(persisted?.blocks[0]).toMatchObject({ persistedId: "new-block-id", resourceId: resource.id, resourceCategory: "document" });
    expect(persisted?.blocks[0].resource?.title).toBe("File");
  });
  it("creates empty library blocks of every category and keeps persistence validation strict", () => {
    for (const category of ["image", "document", "audio", "video"] as const) {
      const block = newLibraryResourceBlock(category);
      expect(block).toMatchObject({ blockType: "library_resource", persistedId: null, resourceId: null, resourceCategory: category, resource: null });
      expect(sessionSaveError({ sessionId: null, status: "draft", title: "Session", blocks: [block] })).toContain("Select a Resource");
    }
  });
  it("selects into the same block only for its active matching category", () => {
    const block = newLibraryResourceBlock("image");
    const resource: ResourceLibraryItem = { id: "resource-id", title: "Image", description: null, category: "image", archivedAt: null,
      createdAt: "", updatedAt: "", canManage: false, currentVersion: { originalFilename: "cover.png", mimeType: "image/png", sizeBytes: 42, uploadedAt: "" }, previewUrl: null };
    expect(libraryResourceBlockIsComplete(block)).toBe(false);
    const selected = selectLibraryResource(block, resource);
    expect(selected).toMatchObject({ key: block.key, resourceId: resource.id, resourceCategory: "image", resource });
    expect(libraryResourceBlockIsComplete(selected)).toBe(true);
    expect(selectLibraryResource(block, { ...resource, category: "video" })).toBe(block);
    expect(selectLibraryResource(block, { ...resource, archivedAt: "2026-01-01" })).toBe(block);
  });
  it("cancels only the new block and lets baseline comparison restore dirty state naturally", () => {
    const baseline = { sessionId: "session-id", status: "draft" as const, title: "Lesson", blocks: [saved] };
    for (const category of ["image", "document", "audio", "video"] as const) {
      const fresh = newLibraryResourceBlock(category);
      const withFresh = { ...baseline, blocks: [...baseline.blocks, fresh] };
      const canceled = { ...withFresh, blocks: removeStagedBlock(withFresh.blocks, fresh.key) };
      expect(canceled).toEqual(baseline);
      expect(editorStateIsDirty(canceled, baseline)).toBe(false);
      expect(removeStagedBlock(withFresh.blocks, saved.key)).toEqual([fresh]);
      expect(removeStagedBlock(withFresh.blocks, "missing")).toBe(withFresh.blocks);
    }
    const libraryItem: ResourceLibraryItem = { id: "selected", title: "Selected image", description: null, category: "image", archivedAt: null,
      createdAt: "", updatedAt: "", canManage: false, currentVersion: { originalFilename: "selected.png", mimeType: "image/png", sizeBytes: 10, uploadedAt: "" }, previewUrl: null };
    const selectedBlock = selectLibraryResource(newLibraryResourceBlock("image"), libraryItem);
    expect(removeStagedBlock([saved, selectedBlock], selectedBlock.key)).toEqual([saved]);
    expect(libraryItem).toMatchObject({ id: "selected", title: "Selected image" });
    const partialLink = { ...newStagedBlock("video_link"), title: "Unsaved title", url: "not finished", description: "Discard me" };
    const withLink = { ...baseline, blocks: [...baseline.blocks, partialLink] };
    expect({ ...withLink, blocks: removeStagedBlock(withLink.blocks, partialLink.key) }).toEqual(baseline);
    const withOtherChange = { ...baseline, title: "Changed", blocks: [...baseline.blocks, newLibraryResourceBlock("document")] };
    const canceledWithOtherChange = { ...withOtherChange, blocks: removeStagedBlock(withOtherChange.blocks, withOtherChange.blocks[1].key) };
    expect(editorStateIsDirty(canceledWithOtherChange, baseline)).toBe(true);
  });
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

  it("groups interleaved Page and Resource presentation without changing baseline, and reorders each type independently", () => {
    const blocks = [saved, { ...video, key: "video-1" }, { ...saved, key: "page-2", persistedId: "page-2", title: "Second Page" }, { ...video, key: "video-2" }];
    const baseline = { sessionId: "session-id", status: "draft" as const, title: "Lesson", blocks };
    const pages = blocks.filter((block) => block.blockType === "rich_text");
    const resources = blocks.filter((block) => block.blockType === "video_link");
    expect(pages.map(({ key }) => key)).toEqual(["saved-id", "page-2"]);
    expect(resources.map(({ key }) => key)).toEqual(["video-1", "video-2"]);
    expect(editorStateIsDirty(baseline, baseline)).toBe(false);

    const reorderedPages = moveStagedBlockWithinType(blocks, "rich_text", "page-2", "saved-id");
    expect(reorderedPages.map(({ key }) => key)).toEqual(["page-2", "video-1", "saved-id", "video-2"]);
    expect(reorderedPages.filter(({ blockType }) => blockType === "video_link").map(({ key }) => key)).toEqual(["video-1", "video-2"]);
    const reorderedResources = moveStagedBlockWithinType(blocks, "video_link", "video-2", "video-1");
    expect(reorderedResources.map(({ key }) => key)).toEqual(["saved-id", "video-2", "page-2", "video-1"]);
    expect(reorderedResources.filter(({ blockType }) => blockType === "rich_text").map(({ key }) => key)).toEqual(["saved-id", "page-2"]);
    expect(editorStateIsDirty({ ...baseline, blocks: reorderedPages }, baseline)).toBe(true);
  });

  it("creates Add Page and Add Resource using existing staged block identities and types", () => {
    const page = newStagedBlock("rich_text");
    const resource = newStagedBlock("video_link");
    expect(page.blockType).toBe("rich_text");
    expect(page.key).toMatch(/^local:/);
    expect(page.persistedId).toBeNull();
    expect(page.richTextContent).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(resource.blockType).toBe("video_link");
    expect(resource.key).toMatch(/^local:/);
    expect(resource.persistedId).toBeNull();
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
