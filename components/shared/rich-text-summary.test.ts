import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RichTextSummary } from "./rich-text-summary";

describe("RichTextSummary presentation", () => {
  it("renders the shared title/body layout with a two-line collapsed clamp", () => {
    const markup = renderToStaticMarkup(createElement(RichTextSummary, {
      title: "Communication",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Listen carefully and respond with empathy." }] }] },
      emptyText: "Empty Rich Text block",
    }));
    expect(markup).toContain("Communication");
    expect(markup).toContain("Listen carefully and respond with empathy.");
    expect(markup).toContain("line-clamp-2");
  });
});
