import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./save-session-state", () => ({ saveSessionBuilderState: vi.fn() }));

import { SessionEditor } from "./session-editor";

describe("unified Session editor presentation", () => {
  it("shows title, Session Material, Add Content, and Session-level actions before the first save", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, { session: null }));
    expect(markup).toContain("Session title");
    expect(markup).toContain("Session Material");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Back to Session Builder");
    expect(markup).toContain("Add Content");
    expect(markup).toContain("Save Draft");
    expect(markup).toContain("Publish Session");
    expect(markup).not.toContain("Save Block");
    expect(markup).not.toContain("Session authoring workspaces");
    expect(markup).toMatch(/disabled=""[^>]*>Save Draft/);
  });

  it("keeps saved Draft actions at Session level and shows the Homework workspace", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", updatedAt: "" },
      homework: createElement("div", null, "Homework shell"),
    }));
    expect(markup).toContain("Session authoring workspaces");
    expect(markup).toContain("Discard Changes");
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("Back to Session Builder");
    expect(markup).toContain("Session Material");
    expect(markup).toContain("Homework");
    expect(markup).toContain("Save Changes");
    expect(markup).toContain("Publish Session");
    expect(markup).toContain("mb-6 flex gap-2 border-b border-border");
    expect(markup).not.toContain("mt-8 border-t border-border pt-6");
  });

  it("keeps Published Session editable without a Publish action", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Published", status: "published", updatedAt: "" },
    }));
    expect(markup).toContain("Save Changes");
    expect(markup).toContain("Discard Changes");
    expect(markup).not.toContain("Publish Session");
  });

  it("renders Session Material Rich Text through the shared collapsed summary", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", updatedAt: "" },
      blocks: [{ id: "rich-1", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The summary body is shared." }] }] }, url: null, description: null }],
    }));
    expect(markup).toContain("Reading");
    expect(markup).toContain("The summary body is shared.");
    expect(markup).toContain("line-clamp-2");
  });
});
