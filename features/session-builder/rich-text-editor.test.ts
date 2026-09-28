import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSchema } from "@tiptap/core";

vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    chain: () => ({ focus: () => ({ setParagraph() {}, toggleHeading() {}, toggleBold() {}, toggleBulletList() {}, toggleOrderedList() {}, undo() {}, redo() {} }) }),
  }),
  EditorContent: ({ className }: { className: string }) => createElement("div", { className }),
}));

import { RichTextEditor, richTextEditorExtensions, richTextEditorViewportClass } from "./rich-text-editor";

describe("RichTextEditor extension configuration", () => {
  it("registers Link once through the explicitly configured extension", () => {
    const extensions = richTextEditorExtensions();
    expect(extensions[0]?.options).toMatchObject({ link: false });
    expect(extensions[1]?.name).toBe("link");
    expect(extensions[1]?.options).toMatchObject({ openOnClick: false });
  });

  it("keeps the structured Rich Text nodes and marks used by read-only rendering", () => {
    const schema = getSchema(richTextEditorExtensions());
    expect(schema.nodes.heading).toBeDefined();
    expect(schema.nodes.paragraph).toBeDefined();
    expect(schema.nodes.bulletList).toBeDefined();
    expect(schema.nodes.orderedList).toBeDefined();
    expect(schema.marks.bold).toBeDefined();
    expect(schema.marks.link?.spec.attrs).toMatchObject({ href: {}, target: {}, rel: {} });
  });

  it("keeps the toolbar outside a bounded, internally scrolling editor viewport", () => {
    const markup = renderToStaticMarkup(createElement(RichTextEditor, { content: {}, onChange: () => undefined }));
    expect(richTextEditorViewportClass).toContain("max-h-[min(28rem,45vh)]");
    expect(richTextEditorViewportClass).toContain("overflow-y-auto");
    expect(markup.indexOf("Paragraph")).toBeLessThan(markup.indexOf("max-h-[min(28rem,45vh)]"));
    expect(markup).toContain("sm:max-h-[28rem]");
    expect(markup).toContain("Undo");
    expect(markup).toContain("Redo");
  });
});
