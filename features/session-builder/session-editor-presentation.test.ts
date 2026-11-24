import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { sessionPreviewTabForWorkspace } from "./workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./save-session-state", () => ({ saveSessionBuilderState: vi.fn() }));
vi.mock("./resource-actions", () => ({ findSessionResources: vi.fn(), refreshSessionResourceAccess: vi.fn() }));

import { SessionEditor } from "./session-editor";

describe("unified Session editor presentation", () => {
  it("places one shared Preview control beside the workspace tabs and keeps section actions contextual", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, { session: null }));
    expect(markup).toContain("Session title");
    expect(markup).toContain("Final Session");
    expect(markup).toContain('role="checkbox" aria-checked="false"');
    expect(markup).toContain("Completing this Session ends the counseling program instead of scheduling another Session.");
    expect(markup).toContain("Session Material");
    expect(markup).toContain("Cancel");
    expect(markup).not.toContain("Back to Session Builder");
    expect(markup).toContain("Add Page");
    expect(markup.match(/>Add Page<\/button>/g)).toHaveLength(1);
    expect(markup).toContain("Add Resource");
    expect(markup).not.toContain("Select Image");
    expect(markup).not.toContain("Choose Image");
    expect(markup).toContain("Session Material Pages");
    expect(markup).toContain("Add supporting videos, links, and other resources for this Session.");
    expect(markup.match(/>Preview<\/button>/g)).toHaveLength(1);
    expect(markup.indexOf('aria-label="Session authoring workspaces"')).toBeLessThan(markup.indexOf(">Preview</button>"));
    expect(markup.indexOf(">Preview</button>")).toBeLessThan(markup.indexOf("Session Material</h2>"));
    expect(markup).toContain("lucide-eye");
    expect(markup.indexOf('aside aria-label="Session Material Pages"')).toBeLessThan(markup.indexOf(">Add Page</button>"));
    expect(markup).toContain("mb-5 grid gap-3");
    expect(markup.indexOf("Session title")).toBeLessThan(markup.indexOf("Final Session"));
    expect(markup.indexOf("Final Session")).toBeLessThan(markup.indexOf("Completing this Session ends the counseling program instead of scheduling another Session."));
    expect(markup).not.toContain(">Rich Text</span>");
    expect(markup).toContain("Save Draft");
    expect(markup).toContain("Publish Session");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publish Session<\/button>/);
    expect(markup).toContain("Enter a session title.");
    expect(markup).not.toContain("Save Block");
    expect(markup).toContain("Session authoring workspaces");
    expect(markup).toMatch(/disabled=""[^>]*>Save Draft/);
  });

  it("opens Preview on the currently active workspace", () => {
    expect(sessionPreviewTabForWorkspace("material")).toBe("material");
    expect(sessionPreviewTabForWorkspace("homework")).toBe("homework");
  });

  it("keeps exactly one shared Preview control when Homework is selected", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
      activeWorkspace: "homework",
      homework: createElement("div", null, "Homework workspace content"),
    }));
    expect(markup.match(/>Preview<\/button>/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-current="page" class="[^"]*bg-white/);
    expect(markup.indexOf('aria-label="Session authoring workspaces"')).toBeLessThan(markup.indexOf(">Preview</button>"));
    expect(markup).toContain("Homework workspace content");
  });

  it("keeps saved Draft actions at Session level and shows the Homework workspace", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
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
    expect(markup).toContain('aria-label="Session authoring workspaces"');
    expect(markup).toContain("bg-surface-muted p-1");
    expect(markup).not.toContain("mt-8 border-t border-border pt-6");
  });

  it.each([
    ["non-final", false],
    ["Final", true],
  ] as const)("allows a no-Homework %s Draft with valid Material to publish without edits", (label, isFinal) => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal, updatedAt: "" },
      blocks: [{ id: "page-id", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Valid Session Material" }] }] }, url: null, description: null }],
    }));
    const publishButton = markup.match(/<button[^>]*>Publish Session<\/button>/)?.[0];
    expect(publishButton).toBeDefined();
    expect(publishButton).not.toMatch(/\sdisabled=""/);
    expect(markup).toMatch(/disabled=""[^>]*>Save Changes/);
    expect(markup).not.toContain("Homework is required");
    expect(markup).not.toContain("Unsaved changes");
  });

  it("explains the existing empty Session Material blocker beside Publish", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
      blocks: [{ id: "page-id", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Empty page", richTextContent: { type: "doc", content: [{ type: "paragraph" }] }, url: null, description: null }],
    }));
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Publish Session<\/button>/);
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Complete or remove “Empty page” before publishing.");
  });

  it("keeps Published Session editable without a Publish action", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Published", status: "published", isFinal: true, updatedAt: "" },
    }));
    expect(markup).toContain("Save Changes");
    expect(markup).toContain("Discard Changes");
    expect(markup).not.toContain("Publish Session");
  });

  it("renders Session Material Pages through the shared collapsed summary", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
      blocks: [{ id: "rich-1", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The summary body is shared." }] }] }, url: null, description: null }],
    }));
    expect(markup).toContain("Reading");
    expect(markup).toContain(">Page</p>");
    expect(markup).toContain("The summary body is shared.");
    expect(markup).toContain("line-clamp-2");
    expect(markup).toContain("Include by Default");
    expect(markup).toMatch(/role="checkbox"[^>]*disabled=""/);
  });

  it("shows one existing Session Material Page at a time while keeping non-Page content available", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
      blocks: [
        { id: "page-one", sessionId: "session-id", blockType: "rich_text", position: 0, title: "Welcome", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "First page body" }] }] }, url: null, description: null },
        { id: "video", sessionId: "session-id", blockType: "video_link", position: 1, title: "Watch", richTextContent: null, url: "https://example.com/watch", description: "Global resource" },
        { id: "page-two", sessionId: "session-id", blockType: "rich_text", position: 2, title: "Discuss", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Second page body" }] }] }, url: null, description: null },
      ],
    }));
    expect(markup).toContain('aside aria-label="Session Material Pages"');
    expect(markup).toContain("PAGE 1");
    expect(markup).toContain("PAGE 2");
    expect(markup).toContain("Welcome");
    expect(markup).toContain("First page body");
    expect(markup).not.toContain("Second page body");
    expect(markup).toContain("Watch");
    expect(markup).toContain("Video / Link");
    expect(markup).toContain('aria-current="page"');
    const pageNavigation = markup.slice(markup.indexOf('<aside aria-label="Session Material Pages"'), markup.indexOf("</aside>") + 8);
    expect(pageNavigation).not.toContain("content block");
    expect(pageNavigation).not.toContain("Selected");
    expect(pageNavigation).toContain("border-text-muted/30 bg-surface-muted");
  });

  it("allows Admins to edit default recommendations while Authors see them read-only", () => {
    const block = { id: "rich-1", sessionId: "session-id", blockType: "rich_text" as const, position: 0, title: "Reading", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Reading body" }] }] }, url: null, description: null, isRecommended: true };
    const session = { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft" as const, isFinal: false, updatedAt: "" };
    const adminMarkup = renderToStaticMarkup(createElement(SessionEditor, { session, blocks: [block], canManageRecommendations: true }));
    const authorMarkup = renderToStaticMarkup(createElement(SessionEditor, { session, blocks: [block], canManageRecommendations: false }));
    expect(adminMarkup).toMatch(/role="checkbox" aria-checked="true"/);
    expect(adminMarkup).not.toMatch(/role="checkbox" aria-checked="true"[^>]*disabled=""/);
    expect(authorMarkup).toMatch(/role="checkbox" aria-checked="true"[^>]*disabled=""/);
  });

  it("groups interleaved persisted Pages and Resources without showing unsaved changes", () => {
    const markup = renderToStaticMarkup(createElement(SessionEditor, {
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
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
      session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
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
        session: { id: "session-id", sequenceNumber: 2, curriculumNumber: 2, title: "Session", status: "draft", isFinal: false, updatedAt: "" },
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
