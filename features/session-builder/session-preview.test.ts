import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/session-builder/rich-text-editor", () => ({
  RichTextReadOnly: ({ content }: { content: Record<string, unknown> }) => createElement("pre", null, JSON.stringify(content)),
}));

import { SessionMaterialPreviewContent, sessionPreviewTargetPage } from "./session-preview";
import type { StagedMaterialBlock } from "./editor-model";
import type { ResourceCategory } from "@/features/resource-library/policy";

const page = (key: string, title: string, text: string): StagedMaterialBlock => ({
  key, persistedId: key, blockType: "rich_text", title,
  richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  url: "", description: "",
});

const resource = (key: string, title: string): StagedMaterialBlock => ({
  key, persistedId: key, blockType: "video_link", title, richTextContent: null,
  url: "https://example.com/resource", description: "Staged resource description",
});

function render(blocks: StagedMaterialBlock[]) {
  return renderToStaticMarkup(createElement(SessionMaterialPreviewContent, { blocks }));
}

describe("Session Material Preview", () => {
  it.each(["image", "document", "audio", "video"] as ResourceCategory[])("renders %s through the shared private Resource presentation", (category) => {
    const id = `${category}-id`;
    const block: StagedMaterialBlock = { key: id, persistedId: id, blockType: "library_resource", title: "", richTextContent: null,
      url: "", description: "", resourceId: id, resourceCategory: category,
      resource: { id, title: `Canonical ${category}`, description: "Current description", category, archivedAt: null,
        createdAt: "", updatedAt: "", canManage: false, currentVersion: { originalFilename: "opaque-original-name.pdf", mimeType: category === "image" ? "image/avif" : category === "document" ? "application/pdf" : category === "audio" ? "audio/mpeg" : "video/mp4", sizeBytes: 2048, uploadedAt: "" }, previewUrl: null } };
    const markup = renderToStaticMarkup(createElement(SessionMaterialPreviewContent, { blocks: [block], resourceAccess: { [id]: "https://private.example/signed" } }));
    expect(markup).toContain(`Canonical ${category}`);
    expect(markup).toContain("Current description");
    expect(markup).toContain(`/resource-library/${id}/open`);
    expect(markup).toContain(`/resource-library/${id}/download`);
    if (category === "image") expect(markup).toContain("<img");
    if (category === "document") {
      expect(markup).toContain("PDF · 2 KB");
      expect(markup).not.toContain("opaque-original-name.pdf");
    }
    if (category === "audio") expect(markup).toContain("<audio");
    if (category === "video") expect(markup).toContain("<video");
    expect(markup).not.toContain("https://private.example/signed</");
  });
  it("shows one current Page with its title, full staged content, count, and first-page navigation state", () => {
    const markup = render([page("p1", "Communication and Expectations", "Staged Page text"), page("p2", "Second Page", "Second staged text")]);
    expect(markup).toContain("Page 1 of 2");
    expect(markup).toContain("Communication and Expectations");
    expect(markup).toMatch(/<h2 class="p-4 pb-0 [^"]*">Communication and Expectations<\/h2>/);
    expect(markup).toContain("Staged Page text");
    expect(markup).not.toContain("Second Page");
    expect(markup).not.toContain("Second staged text");
    expect(markup).toMatch(/disabled=""[^>]*>Previous Page/);
    expect(markup).toContain(">Next Page</button>");
  });

  it("moves through staged Pages by stable key without changing staged content", () => {
    const staged = [page("p1", "First", "First body"), page("p2", "Second", "Second body")];
    const original = structuredClone(staged);
    const secondPage = sessionPreviewTargetPage(staged, null, 1);
    expect(secondPage).toBe("p2");
    expect(sessionPreviewTargetPage(staged, secondPage, -1)).toBe("p1");
    expect(sessionPreviewTargetPage(staged, secondPage, 1)).toBeNull();
    expect(staged).toEqual(original);
  });

  it("renders Resources separately even without Pages and shares the Homework Video / Link presentation", () => {
    const markup = render([resource("r1", "Staged resource")]);
    expect(markup).toContain("Resources");
    expect(markup).toContain("Staged resource");
    expect(markup).toContain("Staged resource description");
    expect(markup).toContain('href="https://example.com/resource"');
    expect(markup).toContain("Open Link");
    expect(markup).not.toMatch(/<p[^>]*>https:\/\/example\.com\/resource<\/p>/);
    expect(markup).not.toContain("Page 1 of");
    expect(render([])).toContain("No Session Material yet.");
  });
});
