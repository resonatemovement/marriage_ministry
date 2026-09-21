import { describe, expect, it } from "vitest";

import { isSessionLifecycleAction, isSessionStatus, isValidMaterialUrl, materialPreview, materialUrlFrom, normalizeSessionTitle, richTextHasMeaningfulContent, richTextLinkAttributes, sessionLifecycleTarget, sessionStatusLabel } from "./model";

describe("Session Builder lifecycle", () => {
  it("recognizes supported statuses and labels", () => {
    expect(isSessionStatus("draft")).toBe(true);
    expect(isSessionStatus("invalid")).toBe(false);
    expect(isSessionLifecycleAction("archive")).toBe(true);
    expect(isSessionLifecycleAction("invalid")).toBe(false);
    expect(sessionStatusLabel("published")).toBe("Published");
  });

  it("normalizes a title before saving", () => {
    expect(normalizeSessionTitle("  Session one  ")).toBe("Session one");
  });

  it("allows only archive and restore lifecycle transitions", () => {
    expect(sessionLifecycleTarget("draft", "archive")).toBe("archived");
    expect(sessionLifecycleTarget("published", "archive")).toBe("archived");
    expect(sessionLifecycleTarget("archived", "restore")).toBe("draft");
    expect(sessionLifecycleTarget("draft", "restore")).toBeNull();
  });
});

describe("Session Material", () => {
  it("validates meaningful rich text and http URLs", () => {
    expect(richTextHasMeaningfulContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] })).toBe(true);
    expect(richTextHasMeaningfulContent({ type: "doc", content: [{ type: "paragraph" }] })).toBe(false);
    expect(isValidMaterialUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidMaterialUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isValidMaterialUrl("https://example.com/article")).toBe(true);
    expect(isValidMaterialUrl("http://example.com/article")).toBe(true);
    expect(isValidMaterialUrl("not-a-url")).toBe(false);
    expect(isValidMaterialUrl("ftp://example.com/file")).toBe(false);
    expect(isValidMaterialUrl("mailto:test@example.com")).toBe(false);
    expect(isValidMaterialUrl("javascript:alert(1)")).toBe(false);
  });

  it("parses the Video / Link URL from the submitted form key", () => {
    const form = new FormData();
    form.set("url", " https://www.youtube.com/watch?v=dQw4w9WgXcQ ");
    expect(materialUrlFrom(form)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    form.set("url", "https://youtu.be/dQw4w9WgXcQ");
    expect(isValidMaterialUrl(materialUrlFrom(form))).toBe(true);
    form.set("url", "https://example.com/article");
    expect(isValidMaterialUrl(materialUrlFrom(form))).toBe(true);
    form.set("url", "not-a-url");
    expect(isValidMaterialUrl(materialUrlFrom(form))).toBe(false);
  });

  it("derives readable summaries without requiring titles", () => {
    expect(materialPreview({ blockType: "rich_text", title: null, richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A helpful lesson" }] }] }, url: null, description: null })).toBe("A helpful lesson");
    expect(materialPreview({ blockType: "video_link", title: null, richTextContent: null, url: "https://example.com", description: null })).toBe("https://example.com");
  });

  it("stores or removes new-tab link attributes", () => {
    expect(richTextLinkAttributes("https://example.com", false)).toEqual({ href: "https://example.com" });
    expect(richTextLinkAttributes("https://example.com", true)).toEqual({ href: "https://example.com", target: "_blank", rel: "noopener noreferrer" });
  });
});
