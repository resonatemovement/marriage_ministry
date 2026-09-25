import { describe, expect, it } from "vitest";

import { richTextEditorExtensions } from "./rich-text-editor";

describe("RichTextEditor extension configuration", () => {
  it("registers Link once through the explicitly configured extension", () => {
    const extensions = richTextEditorExtensions();
    expect(extensions[0]?.options).toMatchObject({ link: false });
    expect(extensions[1]?.name).toBe("link");
    expect(extensions[1]?.options).toMatchObject({ openOnClick: false });
  });
});
