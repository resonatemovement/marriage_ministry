import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/session-builder/rich-text-editor", () => ({
  RichTextReadOnly: ({ content }: { content: Record<string, unknown> }) => createElement("pre", null, JSON.stringify(content)),
}));

import { SessionMaterialPreviewContent, sessionPreviewTargetPage } from "./session-preview";
import type { StagedMaterialBlock } from "./editor-model";

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
