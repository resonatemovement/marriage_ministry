import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/session-builder/rich-text-editor", () => ({
  RichTextEditor: () => createElement("div", { "data-rich-text-editor": true }),
}));

import { HomeworkRichTextAuthoring } from "./homework-rich-text-authoring";

const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "test" }] }] };

function render(title: string | null, content: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(HomeworkRichTextAuthoring, {
    title, content, onTitleChange: vi.fn(), onContentChange: vi.fn(), onDone: vi.fn(), onCancel: vi.fn(),
  }));
}

describe("Homework Rich Text authoring", () => {
  it("labels the Homework block title optional and enables Done for body text 'test'", () => {
    const markup = render(null, body);
    expect(markup).toContain("Title (optional)");
    expect(markup).toContain('data-rich-text-editor="true"');
    expect(markup).toMatch(/<button type="button" class="[^"]*">Done<\/button>/);
    expect(markup).not.toContain(">Title</label>");
  });

  it("keeps Done disabled when the Homework Rich Text body is empty", () => {
    const markup = render(null, { type: "doc", content: [{ type: "paragraph" }] });
    expect(markup).toContain("Title (optional)");
    expect(markup).toMatch(/<button type="button" disabled=""[^>]*>Done<\/button>/);
  });

  it("keeps existing titles editable and accepts a cleared title when body remains valid", () => {
    const titled = render("Existing title", body);
    const cleared = render("", body);
    expect(titled).toContain('value="Existing title"');
    expect(cleared).toContain('value=""');
    expect(cleared).toMatch(/<button type="button" class="[^"]*">Done<\/button>/);
  });
});
