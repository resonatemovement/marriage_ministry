import { describe, expect, it } from "vitest";

import { richTextSummary, richTextSummaryOverflows } from "./rich-text-summary-model";

describe("shared Rich Text summary extraction", () => {
  it("uses an explicit title and omits an identical first heading after whitespace normalization", () => {
    const content = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Communication   and Expectations" }] },
      { type: "paragraph", content: [{ type: "text", text: "Healthy communication requires both partners to listen." }] },
    ] };
    expect(richTextSummary(content, " Communication and\nExpectations ")).toEqual({
      title: "Communication and Expectations",
      body: "Healthy communication requires both partners to listen.",
    });
  });

  it("promotes the first meaningful heading when the block has no explicit title", () => {
    const content = { type: "doc", content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A meaningful heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "Remaining body text." }] },
    ] };
    expect(richTextSummary(content, null)).toEqual({ title: "A meaningful heading", body: "Remaining body text." });
  });

  it("retains a different first heading in the body and extracts paragraph, list, and link text", () => {
    const content = { type: "doc", content: [
      { type: "heading", content: [{ type: "text", text: "Section heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body " }, { type: "text", text: "with a link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] },
      { type: "bulletList", content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First item" }] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Second item" }] }] },
      ] },
    ] };
    expect(richTextSummary(content, "Explicit title")).toEqual({
      title: "Explicit title",
      body: "Section heading\nBody with a link\nFirst item\nSecond item",
    });
  });

  it("does not mutate the source Tiptap JSON", () => {
    const content = { type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Heading" }] }, { type: "paragraph", content: [{ type: "text", text: "Body" }] }] };
    const before = structuredClone(content);
    richTextSummary(content, null);
    expect(content).toEqual(before);
  });

  it("shows expansion only when the collapsed element has measurable overflow", () => {
    expect(richTextSummaryOverflows(40, 40)).toBe(false);
    expect(richTextSummaryOverflows(40, 42)).toBe(false);
    expect(richTextSummaryOverflows(41, 40)).toBe(false);
    expect(richTextSummaryOverflows(43, 40)).toBe(true);
  });
});
