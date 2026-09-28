import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { addHomeworkBlock, deleteHomeworkBlock, duplicateHomeworkBlock, homeworkEditorIsDirty, homeworkEditorStateFromRows, reorderHomeworkBlocks, updateHomeworkBlock } from "./homework-editor-model";
import type { StagedHomeworkBlock } from "./homework-editor-model";

vi.mock("@/features/session-builder/rich-text-editor", async () => {
  const React = await import("react");
  return {
    RichTextReadOnly: ({ content }: { content: Record<string, unknown> }) =>
      React.createElement("pre", { "data-rich-text": true }, JSON.stringify(content)),
  };
});

import { HomeworkPreviewContent } from "./homework-preview";

const documentWithText = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

function render(blocks: StagedHomeworkBlock[]) {
  return renderToStaticMarkup(createElement(HomeworkPreviewContent, { blocks }));
}

describe("Homework Preview content", () => {
  it("renders the exact current staged order and unsaved add, edit, duplicate, delete, and reorder changes", () => {
    const initial = homeworkEditorStateFromRows("draft-id", [
      { id: "rich-id", homeworkBlockId: "rich-block", blockType: "rich_text", position: 0, title: "Original title", richTextContent: documentWithText("Original reading"), url: null, description: null },
      { id: "video-id", homeworkBlockId: "video-block", blockType: "video_link", position: 1, title: "Remove this", richTextContent: null, url: "https://example.com/remove", description: "Remove this link" },
      { id: "long-id", homeworkBlockId: "long-block", blockType: "long_answer", position: 2, title: null, richTextContent: documentWithText("Original question"), url: null, description: null },
    ]);
    const edited = updateHomeworkBlock(initial, "rich-id", {
      title: "Unsaved reading",
      richTextContent: documentWithText("Unsaved edited reading"),
    });
    const withAdded = addHomeworkBlock(edited, {
      key: "local:added",
      persistedId: null,
      homeworkBlockId: null,
      blockType: "video_link",
      position: 0,
      title: "Unsaved added link",
      richTextContent: null,
      url: "https://example.com/added",
      description: "Added without saving",
    });
    const duplicated = duplicateHomeworkBlock(withAdded.blocks, "long-id", "local:duplicate");
    const reordered = reorderHomeworkBlocks(duplicated.blocks, "local:added", "rich-id");
    const staged = {
      ...withAdded,
      blocks: deleteHomeworkBlock(reordered, "video-id", "DELETE"),
      baseline: initial.baseline,
      editingKey: null,
    };
    const beforeRender = structuredClone(staged);

    const markup = render(staged.blocks);

    expect(markup.indexOf("Unsaved added link")).toBeLessThan(markup.indexOf("Unsaved reading"));
    expect(markup.indexOf("Unsaved reading")).toBeLessThan(markup.indexOf("Original question"));
    expect(markup).toContain("Unsaved edited reading");
    expect(markup).toContain("Added without saving");
    expect(markup).toContain("Original question");
    expect(markup.match(/Original question/g)).toHaveLength(2);
    expect(markup).not.toContain("Remove this");
    expect(markup).not.toContain("Move Up");
    expect(markup).not.toContain("Duplicate");
    expect(markup).not.toContain("Delete");
    expect(staged).toEqual(beforeRender);
    expect(homeworkEditorIsDirty(staged)).toBe(true);
  });

  it("renders Video / Link title and description with a safe action but no visible raw URL", () => {
    const block: StagedHomeworkBlock = {
      key: "video", persistedId: null, homeworkBlockId: null, blockType: "video_link", position: 0,
      title: "Watch together", richTextContent: null, url: "https://example.com/video?topic=care",
      description: "Discuss this video afterward.",
    };
    const original = structuredClone(block);
    const markup = render([block]);

    expect(markup).toContain("Watch together");
    expect(markup).toContain("Discuss this video afterward.");
    expect(markup).toContain('href="https://example.com/video?topic=care"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain("Open Link");
    expect(markup).not.toMatch(/<p[^>]*>https:\/\/example\.com\/video\?topic=care<\/p>/);
    expect(block).toEqual(original);
  });

  it("renders Long Answer prompt with a read-only, non-submittable response sample", () => {
    const block: StagedHomeworkBlock = {
      key: "question", persistedId: null, homeworkBlockId: null, blockType: "long_answer", position: 0,
      title: null, richTextContent: documentWithText("What would help you reconnect?"), url: null, description: null,
    };
    const markup = render([block]);

    expect(markup).toContain("What would help you reconnect?");
    expect(markup).toContain("Your response");
    expect(markup).toContain("preview only");
    expect(markup).toContain("Required");
    expect(markup).toContain('placeholder="Your response"');
    expect(markup).toContain('readOnly=""');
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("name=");
  });

  it("renders a safe empty state and author-facing placeholders for incomplete or unknown blocks", () => {
    expect(render([])).toContain("This Session does not currently include homework content.");

    const incomplete: StagedHomeworkBlock = {
      key: "empty", persistedId: null, homeworkBlockId: null, blockType: "rich_text", position: 0,
      title: "Half-finished", richTextContent: { type: "doc", content: [{ type: "paragraph" }] }, url: null, description: null,
    };
    const unknown = { ...incomplete, key: "future", blockType: "future_content", title: null };
    const markup = render([incomplete, unknown]);

    expect(markup.match(/Incomplete content/g)).toHaveLength(1);
    expect(markup).not.toContain("Half-finished");
    expect(markup).toContain("Complete this block in the editor to preview it.");
    expect(markup).toContain("This content type cannot currently be previewed.");
  });
});
