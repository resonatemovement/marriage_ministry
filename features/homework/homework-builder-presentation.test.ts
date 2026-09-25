import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { HomeworkBuilderContent } from "./homework-builder-content";
import { HomeworkBuilderLoading } from "./homework-builder-loading";
import { HomeworkEditorProvider } from "./homework-editor-state";

const emptyDraft = { id: "draft-id", status: "draft" as const, basedOnVersionNumber: 1, blocks: [] };

describe("Homework Builder shell", () => {
  it("shows a stable loading state", () => {
    const markup = renderToStaticMarkup(createElement(HomeworkBuilderLoading));
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading Homework");
  });

  it("shows the empty Homework authoring state without a redundant Draft badge", () => {
    const markup = renderToStaticMarkup(createElement(HomeworkEditorProvider, { initialDraft: emptyDraft }, createElement(HomeworkBuilderContent, { result: { draft: emptyDraft } })));
    expect(markup).toContain("Homework");
    expect(markup).not.toContain("Draft based on v1");
    expect(markup).not.toContain(">Draft<");
    expect(markup).toContain("No homework content yet");
    expect(markup).toContain("Add readings, videos, and questions");
    expect(markup).toContain("Add Content");
    expect(markup.match(/>Homework</g)).toHaveLength(1);
    expect(markup).not.toContain("Homework content</h3>");
    expect(markup).not.toContain("Changes are staged locally in this editor.");
    expect(markup).not.toContain("border-t border-border");
  });

  it("renders loaded Rich Text, Video / Link, and Long Answer blocks", () => {
    const loadedDraft = {
      ...emptyDraft,
      blocks: [
        { id: "vb-rich", homeworkBlockId: "block-rich", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Persisted reading" }] }] }, url: null, description: null },
        { id: "vb-video", homeworkBlockId: "block-video", blockType: "video_link", position: 1, title: "Watch", richTextContent: null, url: "https://example.com/video", description: "Watch this first" },
        { id: "vb-long", homeworkBlockId: "block-long", blockType: "long_answer", position: 2, title: "Question", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Explain your answer" }] }] }, url: null, description: null },
      ],
    };
    const markup = renderToStaticMarkup(createElement(HomeworkEditorProvider, { initialDraft: loadedDraft }, createElement(HomeworkBuilderContent, { result: { draft: loadedDraft } })));
    expect(markup).toContain("Persisted reading");
    expect(markup).toContain("https://example.com/video");
    expect(markup).toContain("Watch this first");
    expect(markup).toContain("Long Answer");
    expect(markup).toContain("Explain your answer");
    expect(markup).toContain("line-clamp-2");
    expect(markup).not.toContain("This block is preserved and is not editable in this pass.");
    expect(markup).toMatch(/Rich Text<\/p><div><h4/);
    expect(markup.match(/aria-label="Reorder /g)).toHaveLength(3);
    expect(markup.match(/aria-label="Actions for /g)).toHaveLength(3);
    expect(markup.match(/>Edit<\/button>/g)).toHaveLength(3);
  });

  it("preserves unsupported block types without exposing editing, duplicate, delete, or reorder actions", () => {
    const loadedDraft = { ...emptyDraft, blocks: [
      { id: "future-snapshot", homeworkBlockId: "future-logical", blockType: "future_type", position: 0, title: "Future content", richTextContent: { legacy: "value" }, url: "https://example.com/future", description: "Preserve this" },
    ] };
    const markup = renderToStaticMarkup(createElement(HomeworkEditorProvider, { initialDraft: loadedDraft }, createElement(HomeworkBuilderContent, { result: { draft: loadedDraft } })));
    expect(markup).toContain("future_type");
    expect(markup).toContain("This block is preserved and is not editable in this pass.");
    expect(markup).not.toContain(">Edit</button>");
    expect(markup).not.toContain("Actions for future_type");
    expect(markup).not.toContain("Reorder future_type");
  });

  it("shows stable retryable failures and does not offer retry for withdrawn Homework", () => {
    const unavailable = renderToStaticMarkup(createElement(HomeworkEditorProvider, null, createElement(HomeworkBuilderContent, { result: { error: "unavailable" } })));
    const withdrawn = renderToStaticMarkup(createElement(HomeworkEditorProvider, null, createElement(HomeworkBuilderContent, { result: { error: "withdrawn" } })));
    expect(unavailable).toContain('role="alert"');
    expect(unavailable).toContain("Try again");
    expect(withdrawn).toContain("withdrawn and cannot be edited");
    expect(withdrawn).not.toContain("Try again");
  });
});
