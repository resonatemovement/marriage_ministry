import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { addHomeworkBlock, deleteHomeworkBlock, duplicateHomeworkBlock, homeworkEditorIsDirty, homeworkEditorStateFromRows, reorderHomeworkBlocks, updateHomeworkBlock } from "./homework-editor-model";
import type { StagedHomeworkBlock } from "./homework-editor-model";

vi.mock("@/features/session-builder/rich-text-editor", async () => {
  const React = await import("react");
  return {
    RichTextReadOnly: ({ content, contentClassName }: { content: Record<string, unknown>; contentClassName?: string }) =>
      React.createElement("pre", { "data-rich-text": true, className: contentClassName }, JSON.stringify(content)),
  };
});

import { HomeworkPreviewContent } from "./homework-preview";
import { adjacentHomeworkPageIndex, homeworkPageIndexForId } from "./homework-page-navigation";

const documentWithText = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

function render(blocks: StagedHomeworkBlock[]) {
  return renderToStaticMarkup(createElement(HomeworkPreviewContent, { blocks }));
}

describe("Homework Preview content", () => {
  it("separates the Builder rich-text title and content by 12px while preserving card padding", () => {
    const block = homeworkEditorStateFromRows("draft-id", [
      { id: "rich-id", homeworkBlockId: "rich-block", blockType: "rich_text", position: 0, title: "Reading", richTextContent: documentWithText("Body copy"), url: null, description: null },
    ]).blocks;
    const markup = render(block);

    expect(markup).toContain('<div class="grid gap-3 p-5"><h2 class="font-heading text-lg font-bold text-text-primary">Reading</h2><pre data-rich-text="true" class="p-0">');
    expect(markup).toContain("Body copy");
    expect(markup).not.toContain("px-5 pt-5");
  });

  it("renders untitled published Homework Rich Text body without an empty heading or redundant gap", () => {
    const blocks = homeworkEditorStateFromRows("published-id", [
      { id: "rich-id", homeworkBlockId: "rich-block", blockType: "rich_text", position: 0, title: null, richTextContent: documentWithText("Published body"), url: null, description: null },
    ], "published").blocks;
    const markup = render(blocks);

    expect(markup).toContain("Page 1");
    expect(markup).toContain("Published body");
    expect(markup).not.toContain("<h2 class=\"font-heading text-lg font-bold text-text-primary\"></h2>");
    expect(markup).not.toContain(">null</h2>");
    expect(markup).toContain('<div class="grid gap-3 p-5"><pre data-rich-text="true" class="p-0">');
  });

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
      questionChoices: [],
      isRequired: true,
    });
    const duplicated = duplicateHomeworkBlock(withAdded.blocks, "long-id", "local:duplicate");
    const reordered = reorderHomeworkBlocks(duplicated.blocks, "local:added", "rich-id");
    const staged = {
      ...withAdded,
      blocks: deleteHomeworkBlock(reordered, "video-id", "DELETE"),
      baseline: initial.baseline,
      editingKey: null,
      editingOriginal: null,
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

  it("shows only the selected staged Homework page with Couple-style navigation and preserves staged data", () => {
    const pages = [
      { id: "page-one", title: "Connection", position: 0 },
      { id: "page-two", title: "Repair", position: 1 },
    ];
    const blocks: StagedHomeworkBlock[] = [
      { key: "first", persistedId: null, homeworkBlockId: null, blockType: "rich_text", position: 0, title: "Read together", richTextContent: documentWithText("First page staged body"), url: null, description: null, questionChoices: [], isRequired: true, pageId: "page-one" },
      { key: "second", persistedId: null, homeworkBlockId: null, blockType: "long_answer", position: 1, title: null, richTextContent: documentWithText("Second page staged question"), url: null, description: null, questionChoices: [], isRequired: true, pageId: "page-two" },
    ];
    const beforePreview = structuredClone(blocks);
    const markup = renderToStaticMarkup(createElement(HomeworkPreviewContent, { blocks, pages }));

    expect(markup).toContain("Connection");
    expect(markup).toContain("Page 1 of 2");
    expect(markup).toContain('aria-label="Choose Homework page"');
    expect(markup).toContain("First page staged body");
    expect(markup).not.toContain("Second page staged question");
    expect(markup).toMatch(/disabled=""[^>]*>Previous Page/);
    expect(markup).toContain(">Next Page</button>");
    expect(markup).toContain("grid w-full gap-4 sm:gap-5");
    expect(markup).toContain("sm:flex-row");
    expect(markup).not.toContain("Save Draft");
    expect(markup).not.toContain("Submit Homework");
    expect(markup).not.toContain("<form");
    expect(blocks).toEqual(beforePreview);
    expect(homeworkPageIndexForId(pages, "page-two")).toBe(1);
  });

  it("uses bounded Previous/Next indices and resolves dropdown targets from the staged page order", () => {
    const pages = [
      { id: "one", title: "First", position: 0 },
      { id: "two", title: "Second", position: 1 },
      { id: "three", title: "Third", position: 2 },
    ];

    expect(homeworkPageIndexForId(pages, "three")).toBe(2);
    expect(homeworkPageIndexForId(pages, "missing")).toBe(-1);
    expect(adjacentHomeworkPageIndex(0, -1, 3)).toBe(0);
    expect(adjacentHomeworkPageIndex(0, 1, 3)).toBe(1);
    expect(adjacentHomeworkPageIndex(1, 1, 3)).toBe(2);
    expect(adjacentHomeworkPageIndex(2, 1, 3)).toBe(2);
  });

  it("keeps a single staged Homework page full-width without a page counter or navigation controls", () => {
    const markup = render([{
      key: "only", persistedId: null, homeworkBlockId: null, blockType: "rich_text", position: 0,
      title: null, richTextContent: documentWithText("Single-page draft"), url: null, description: null, questionChoices: [], isRequired: true,
    }]);

    expect(markup).toContain("Page 1");
    expect(markup).toContain("Single-page draft");
    expect(markup).not.toContain("Page 1 of 1");
    expect(markup).not.toContain("Choose Homework page");
    expect(markup).not.toContain("Previous Page");
    expect(markup).not.toContain("Next Page");
  });

  it("renders Video / Link title and description with a safe action but no visible raw URL", () => {
    const block: StagedHomeworkBlock = {
      key: "video", persistedId: null, homeworkBlockId: null, blockType: "video_link", position: 0,
      title: "Watch together", richTextContent: null, url: "https://example.com/video?topic=care",
      description: "Discuss this video afterward.", questionChoices: [], isRequired: true,
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
      title: null, richTextContent: documentWithText("What would help you reconnect?"), url: null, description: null, questionChoices: [], isRequired: true,
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

  it("previews the configured Side-by-Side headings and responsive response areas", () => {
    const block = {
      key: "side-group", persistedId: null, homeworkBlockId: null, blockType: "side_by_side_response", position: 0,
      title: null, richTextContent: null, url: null, description: null, questionChoices: [], isRequired: true,
      sideBySideConfig: { groupId: "side-group", instructions: "Consider both prompts.", leftHeading: "Recognize and Renounce", rightHeading: "Replace and Renew", bothRequired: false },
      sideBySideResponseIds: null,
    } satisfies StagedHomeworkBlock;
    const markup = render([block]);
    expect(markup).toContain("Consider both prompts.");
    expect(markup).toContain("Recognize and Renounce");
    expect(markup).toContain("Replace and Renew");
    expect(markup).toContain("grid-cols-2");
    expect(markup).toContain("sm:gap-4");
    expect(markup.match(/rows="2"/g)).toHaveLength(2);
    expect(markup.match(/min-h-\[66px\]/g)).toHaveLength(2);
    expect(markup.match(/homework-side-by-side-response-textarea field-sizing-content/g)).toHaveLength(2);
    expect(markup).toContain("Responses optional");
    expect(markup).toContain('readOnly=""');
    expect(markup).not.toMatch(/<form/);
  });

  it("keeps rich-text paragraphs aligned with their card heading in Builder previews", () => {
    const richText: StagedHomeworkBlock = {
      key: "reading", persistedId: null, homeworkBlockId: null, blockType: "rich_text", position: 0,
      title: "Reading", richTextContent: documentWithText("Read this together."), url: null, description: null, questionChoices: [], isRequired: true,
    };
    const longAnswer: StagedHomeworkBlock = {
      key: "prompt", persistedId: null, homeworkBlockId: null, blockType: "long_answer", position: 1,
      title: null, richTextContent: documentWithText("What do you notice?"), url: null, description: null, questionChoices: [], isRequired: true,
    };
    const markup = render([richText, longAnswer]);

    expect(markup).toContain('class="grid gap-3 p-5"');
    expect(markup).toContain('class="p-0"');
  });

  it("renders a safe empty state and author-facing placeholders for incomplete or unknown blocks", () => {
    expect(render([])).toContain("This Session does not currently include homework content.");

    const incomplete: StagedHomeworkBlock = {
      key: "empty", persistedId: null, homeworkBlockId: null, blockType: "rich_text", position: 0,
      title: "Half-finished", richTextContent: { type: "doc", content: [{ type: "paragraph" }] }, url: null, description: null, questionChoices: [], isRequired: true,
    };
    const unknown = { ...incomplete, key: "future", blockType: "future_content", title: null };
    const markup = render([incomplete, unknown]);

    expect(markup.match(/Incomplete content/g)).toHaveLength(1);
    expect(markup).not.toContain("Half-finished");
    expect(markup).toContain("Complete this block in the editor to preview it.");
    expect(markup).toContain("This content type cannot currently be previewed.");
  });

  it("previews Checkbox and Radio questions with prompt before ordered, disabled choices", () => {
    const choices = [
      { id: "choice-1", label: "First option" },
      { id: "choice-2", label: "Second option" },
    ];
    const checkbox: StagedHomeworkBlock = {
      key: "checkbox", persistedId: null, homeworkBlockId: null, blockType: "checkbox_question", position: 0,
      title: null, richTextContent: documentWithText("Choose all that apply"), url: null, description: null, questionChoices: choices, isRequired: true,
    };
    const radio: StagedHomeworkBlock = { ...checkbox, key: "radio", blockType: "radio_question", position: 1, isRequired: false };
    const markup = render([checkbox, radio]);

    expect(markup.indexOf("Choose all that apply")).toBeLessThan(markup.indexOf("First option"));
    expect(markup.indexOf("First option")).toBeLessThan(markup.indexOf("Second option"));
    expect(markup).toContain('aria-labelledby="homework-preview-question-checkbox"');
    expect(markup).toContain('aria-labelledby="homework-preview-question-radio"');
    expect(markup).toMatch(/role="checkbox"[^>]*disabled=""/);
    expect(markup).toMatch(/role="radio"[^>]*disabled=""/);
    expect(markup.match(/data-slot="checkbox"/g)).toHaveLength(2);
    expect(markup).toContain("Required");
    expect(markup).toContain("Optional");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("name=");
  });

  it("keeps incomplete selection questions in the author preview placeholder", () => {
    const incomplete: StagedHomeworkBlock = {
      key: "incomplete", persistedId: null, homeworkBlockId: null, blockType: "checkbox_question", position: 0,
      title: null, richTextContent: documentWithText("Question"), url: null, description: null,
      questionChoices: [{ id: "one", label: "Only one" }], isRequired: true,
    };
    expect(render([incomplete])).toContain("Incomplete content");
  });
});
