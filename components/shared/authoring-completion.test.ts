import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { richTextBlockIsComplete, richTextHasMeaningfulContent, videoLinkIsComplete } from "./authoring-completion";
import { isValidMaterialUrl } from "@/features/session-builder/model";
import { isValidHomeworkVideoUrl } from "@/features/homework/homework-url";
import { RichTextBlockAuthoring } from "@/features/session-builder/rich-text-block-authoring";

const emptyDocument = { type: "doc", content: [{ type: "paragraph" }] };
const whitespaceDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: " \n  " }] }] };
const meaningfulDocument = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A meaningful prompt" }] }] };

describe("shared block authoring completion", () => {
  it.each([
    ["empty title and body", "", emptyDocument],
    ["title only", "Reading", emptyDocument],
    ["body only", "", meaningfulDocument],
    ["whitespace title", " \n ", meaningfulDocument],
    ["empty paragraph", "Reading", emptyDocument],
    ["whitespace body", "Reading", whitespaceDocument],
  ])("keeps Rich Text incomplete for %s", (_name, title, body) => {
    expect(richTextBlockIsComplete(title, body)).toBe(false);
  });

  it("enables Rich Text only when both title and body are meaningful, and disables again when either is cleared", () => {
    expect(richTextBlockIsComplete(" Reading ", meaningfulDocument)).toBe(true);
    expect(richTextBlockIsComplete("  ", meaningfulDocument)).toBe(false);
    expect(richTextBlockIsComplete("Reading", emptyDocument)).toBe(false);
  });

  it("renders the shared Rich Text Done control disabled until complete", () => {
    const done = vi.fn();
    const incomplete = renderToStaticMarkup(createElement(RichTextBlockAuthoring, {
      title: "Reading", content: emptyDocument, onTitleChange: vi.fn(), onContentChange: vi.fn(), onDone: done,
    }));
    const complete = renderToStaticMarkup(createElement(RichTextBlockAuthoring, {
      title: "Reading", content: meaningfulDocument, onTitleChange: vi.fn(), onContentChange: vi.fn(), onDone: done,
    }));
    const longAnswer = renderToStaticMarkup(createElement(RichTextBlockAuthoring, {
      title: null, content: meaningfulDocument, onContentChange: vi.fn(), onDone: done, requireTitle: false,
    }));
    expect(incomplete).toContain("disabled=");
    expect(complete).toContain("Done</button>");
    expect(complete).not.toContain("disabled=");
    expect(longAnswer).not.toContain(">Title<");
    expect(longAnswer).not.toContain("disabled=");
  });

  it("uses the same meaningful Rich Text validator for Long Answer prompts", () => {
    expect(richTextHasMeaningfulContent(emptyDocument)).toBe(false);
    expect(richTextBlockIsComplete(null, emptyDocument, false)).toBe(false);
    expect(richTextBlockIsComplete(null, whitespaceDocument, false)).toBe(false);
    expect(richTextHasMeaningfulContent(meaningfulDocument)).toBe(true);
    expect(richTextBlockIsComplete(null, meaningfulDocument, false)).toBe(true);
    expect(richTextBlockIsComplete(null, emptyDocument, false)).toBe(false);
  });

  it.each([
    [{ title: "", url: "https://example.com", description: "Watch" }],
    [{ title: "Watch", url: "", description: "Watch" }],
    [{ title: "Watch", url: "https://example.com", description: "" }],
    [{ title: "  ", url: "https://example.com", description: "Watch" }],
    [{ title: "Watch", url: "  ", description: "Watch" }],
    [{ title: "Watch", url: "https://example.com", description: " \n " }],
  ])("keeps Video / Link incomplete when a required value is absent or whitespace", (values) => {
    expect(videoLinkIsComplete(values, isValidMaterialUrl)).toBe(false);
  });

  it("injects each feature's existing Video / Link URL contract", () => {
    const invalidUrl = { title: "Watch", url: "not a URL", description: "Watch this" };
    const dbValidityDifference = { title: "Watch", url: "https://service_name.example/video", description: "Watch this" };
    const valid = { title: "Watch", url: "https://example.com/video", description: "Watch this" };
    expect(videoLinkIsComplete(invalidUrl, isValidMaterialUrl)).toBe(false);
    expect(videoLinkIsComplete(invalidUrl, isValidHomeworkVideoUrl)).toBe(false);
    expect(videoLinkIsComplete(dbValidityDifference, isValidMaterialUrl)).toBe(true);
    expect(videoLinkIsComplete(dbValidityDifference, isValidHomeworkVideoUrl)).toBe(false);
    expect(videoLinkIsComplete(valid, isValidMaterialUrl)).toBe(true);
    expect(videoLinkIsComplete(valid, isValidHomeworkVideoUrl)).toBe(true);
  });
});
