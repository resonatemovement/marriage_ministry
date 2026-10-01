import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sessionPreviewTabForWorkspace } from "./workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./save-session-state", () => ({ saveSessionBuilderState: vi.fn() }));
vi.mock("./resource-actions", () => ({ findSessionResources: vi.fn(), refreshSessionResourceAccess: vi.fn() }));

import { SessionEditor } from "./session-editor";

describe("unified Session editor presentation", () => {
  it("shows one Session-level Preview action and keeps Session Material actions in its header", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, { session: null }));
    expect(markup).toContain("Session title");
    expect(markup).toContain("Session Material");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Back to Session Builder");
    expect(markup).toContain("Add Page");
    expect(markup.match(/>Add Page<\/button>/g)).toHaveLength(1);
    expect(markup).toContain("Add Resource");
    expect(markup).not.toContain("Select Image");
    expect(markup).not.toContain("Choose Image");
    expect(markup).toContain("Create and organize the reading material for this Session.");
    expect(markup).toContain("Add supporting videos, links, and other resources for this Session.");
    expect(markup.match(/>Preview<\/button>/g)).toHaveLength(1);
    expect(markup.indexOf(">Preview</button>")).toBeLessThan(markup.indexOf("Session Material</h2>"));
    expect(markup.indexOf(">Add Page</button>")).toBeLessThan(markup.indexOf(">Pages</h2>"));
    expect(markup).toContain("mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3");
    expect(markup).not.toContain(">Rich Text</span>");
    expect(markup).toContain("Save Draft");
    expect(markup).toContain("Publish Session");
    expect(markup).not.toContain("Save Block");
    expect(markup).not.toContain("Session authoring workspaces");
    expect(markup).toMatch(/disabled=""[^>]*>Save Draft/);
  });

  it("opens Preview on the currently active workspace", () => {
    expect(sessionPreviewTabForWorkspace("material")).toBe("material");
    expect(sessionPreviewTabForWorkspace("homework")).toBe("homework");
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

  it("renders Session Material Pages through the shared collapsed summary", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", updatedAt: "" },
      blocks: [{ id: "rich-1", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The summary body is shared." }] }] }, url: null, description: null }],
    }));
    expect(markup).toContain("Reading");
    expect(markup).toContain(">Page</p>");
    expect(markup).toContain("The summary body is shared.");
    expect(markup).toContain("line-clamp-2");
  });

  it("groups interleaved persisted Pages and Resources without showing unsaved changes", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", updatedAt: "" },
      blocks: [
        { id: "page-1", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Page one", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Page one body" }] }] }, url: null, description: null },
        { id: "resource-1", sessionId: "session-id", blockType: "video_link", position: 1, title: "Resource one", richTextContent: null, url: "https://example.com/one", description: "First resource" },
        { id: "page-2", sessionId: "session-id", blockType: "rich_text", position: 2, title: "Page two", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Page two body" }] }] }, url: null, description: null },
        { id: "resource-2", sessionId: "session-id", blockType: "video_link", position: 3, title: "Resource two", richTextContent: null, url: "https://example.com/two", description: "Second resource" },
      ],
    }));
    expect(markup.indexOf("Page one")).toBeLessThan(markup.indexOf("Page two"));
    expect(markup.indexOf("Resource one")).toBeLessThan(markup.indexOf("Resource two"));
    expect(markup.indexOf("Page two")).toBeLessThan(markup.indexOf("Resources"));
    expect(markup).not.toContain("Unsaved changes");
  });

  it("renders Video / Link with the shared Resource icon treatment and preserves its title summary", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", updatedAt: "" },
      blocks: [{ id: "link-1", sessionId: "session-id", blockType: "video_link", position: 0, title: "Watch together", richTextContent: null, url: "https://example.com/video", description: "A discussion video" }],
    }));
    expect(markup).toContain("Video / Link");
    expect(markup).toContain("Watch together");
    expect(markup).toContain("size-12 shrink-0 place-items-center rounded bg-surface-muted text-brand-primary");
    expect(markup).toContain("lucide-external-link");
  });

  it.each([["image", "image/avif", "AVIF · 1 KB"], ["document", "application/pdf", "PDF · 1 KB"], ["audio", "audio/mp4", "M4A · 1 KB"], ["video", "video/webm", "WEBM · 1 KB"]] as const)(
    "shows MIME type and size for Session %s without the original filename",
    (category, mimeType, metadata) => {
      const markup = renderToStaticMarkup(createElement(SessionEditor, {
        session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", updatedAt: "" },
        blocks: [{ id: "resource-1", sessionId: "session-id", blockType: "library_resource", position: 0, title: null, richTextContent: null, url: null, description: null,
          resourceId: "resource-id", resourceCategory: category,
          resource: { id: "resource-id", title: "Session resource", description: null, category, archivedAt: null, createdAt: "", updatedAt: "", canManage: false,
            currentVersion: { originalFilename: "private-original-name.dat", mimeType, sizeBytes: 1024, uploadedAt: "" }, previewUrl: null } }],
      }));
      expect(markup).toContain("Session resource");
      expect(markup).toContain(metadata);
      expect(markup).not.toContain("private-original-name.dat");
    },
  );
});
