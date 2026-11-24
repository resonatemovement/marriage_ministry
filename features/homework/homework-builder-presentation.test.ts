import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { HomeworkBuilderContent } from "./homework-builder-content";
import { HomeworkBuilderLoading } from "./homework-builder-loading";
import { HomeworkEditorProvider } from "./homework-editor-state";
import { sideBySideResponseMetadata } from "./side-by-side-response";

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
    expect(markup).toContain("No content on this page yet.");
    expect(markup).toContain("Add Homework content to this page");
    expect(markup).not.toContain(">Preview</button>");
    expect(markup).toContain("Add Content");
    expect(markup.match(/>Add Content<\/button>/g)).toHaveLength(1);
    expect(markup.match(/>Homework</g)).toHaveLength(1);
    expect(markup).not.toContain("Homework content</h3>");
    expect(markup).not.toContain("Changes are staged locally in this editor.");
    expect(markup).toContain('aside aria-label="Homework pages"');
    expect(markup).toContain('nav aria-label="Pages"');
    expect(markup).toContain("lg:grid-cols-[21rem_minmax(0,1fr)]");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("Page 1");
    expect(markup).toContain(">Add Page</button>");
    expect(markup).toContain("Page title");
    expect(markup).toContain('aria-label="Move page up"');
    expect(markup).toContain('aria-label="Move page down"');
    expect(markup).toContain("break-words");
    expect(markup).toContain("min-h-16 w-full gap-1 rounded-md border px-3 py-2 text-left");
  });

  it("keeps Preview in the shared workspace row instead of duplicating it in the Homework section", () => {
    const markup = renderToStaticMarkup(createElement(HomeworkEditorProvider, { initialDraft: emptyDraft }, createElement(HomeworkBuilderContent, { result: { draft: emptyDraft } })));
    expect(markup).not.toContain(">Preview</button>");
    expect(markup).toContain(">Add Page</button>");
    expect(markup).toContain(">Add Content</button>");
  });

  it("renders loaded legacy and selection-question blocks with their saved authoring summary", () => {
    const loadedDraft = {
      ...emptyDraft,
      blocks: [
        { id: "vb-rich", homeworkBlockId: "block-rich", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Persisted reading" }] }] }, url: null, description: null },
        { id: "vb-video", homeworkBlockId: "block-video", blockType: "video_link", position: 1, title: "Watch", richTextContent: null, url: "https://example.com/video", description: "Watch this first" },
        { id: "vb-long", homeworkBlockId: "block-long", blockType: "long_answer", position: 2, title: "Question", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Explain your answer" }] }] }, url: null, description: null },
        { id: "vb-checkbox", homeworkBlockId: "block-checkbox", blockType: "checkbox_question", position: 3, title: null, richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Select all" }] }] }, url: null, description: null, questionChoices: [{ id: "c1", label: "Choice A" }, { id: "c2", label: "Choice B" }], isRequired: true },
        { id: "vb-radio", homeworkBlockId: "block-radio", blockType: "radio_question", position: 4, title: null, richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Select one" }] }] }, url: null, description: null, questionChoices: [{ id: "c3", label: "Choice C" }, { id: "c4", label: "Choice D" }], isRequired: false },
      ],
    };
    const markup = renderToStaticMarkup(createElement(HomeworkEditorProvider, { initialDraft: loadedDraft }, createElement(HomeworkBuilderContent, { result: { draft: loadedDraft } })));
    expect(markup).toContain("Persisted reading");
    expect(markup).toContain("https://example.com/video");
    expect(markup).toContain("Watch this first");
    expect(markup).toContain("Long Answer");
    expect(markup).toContain("Explain your answer");
    expect(markup).toContain("Checkbox Question");
    expect(markup).toContain("Select all");
    expect(markup).toContain("2 choices · Required");
    expect(markup).toContain("Radio Question");
    expect(markup).toContain("Select one");
    expect(markup).toContain("2 choices · Optional");
    expect(markup).toContain("5 content blocks");
    expect(markup).toContain("line-clamp-2");
    expect(markup).not.toContain("This block is preserved and is not editable in this pass.");
    expect(markup).toMatch(/Rich Text<\/p><div><h4/);
    expect(markup.match(/aria-label="Reorder /g)).toHaveLength(5);
    expect(markup.match(/aria-label="Actions for /g)).toHaveLength(5);
    expect(markup.match(/>Edit<\/button>/g)).toHaveLength(5);
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

  it("restores a saved Side-by-Side pair as one editable and reorderable builder block", () => {
    const config = { groupId: "pair-id", instructions: "Think it through.", leftHeading: "Recognize", rightHeading: "Renew", bothRequired: false };
    const loadedDraft = { ...emptyDraft, blocks: (["left", "right"] as const).map((side, position) => ({
      id: `${side}-snapshot`, homeworkBlockId: `${side}-logical`, blockType: "long_answer", position,
      title: side === "left" ? config.leftHeading : config.rightHeading,
      richTextContent: { type: "doc", content: [] }, url: null,
      description: sideBySideResponseMetadata({ ...config, side }),
    })) };
    const markup = renderToStaticMarkup(createElement(HomeworkEditorProvider, { initialDraft: loadedDraft }, createElement(HomeworkBuilderContent, { result: { draft: loadedDraft } })));
    expect(markup).toContain("Side-by-Side Response");
    expect(markup).toContain("Recognize");
    expect(markup).toContain("Renew");
    expect(markup).toContain("Responses optional");
    expect(markup.match(/Actions for Side-by-Side Response block/g)).toHaveLength(1);
    expect(markup.match(/Reorder Side-by-Side Response block/g)).toHaveLength(1);
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
