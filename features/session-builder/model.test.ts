import { describe, expect, it } from "vitest";

import { canPublishSession, isSessionLifecycleAction, isSessionStatus, isValidMaterialUrl, materialPreview, materialUrlFrom, materialValuesAreEqual, movedBlockIds, normalizeSessionTitle, reorderedBlockIds, richTextHasMeaningfulContent, richTextLinkAttributes, sessionLifecycleTarget, sessionStatusLabel, sessionTitleIsDirty } from "./model";

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
  const richText = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };
  const video = { blockType: "video_link" as const, title: "Video", richTextContent: { type: "doc" }, url: "https://example.com", description: "Description" };

  it("compares session and material values against persisted baselines", () => {
    expect(sessionTitleIsDirty("Session", "Session")).toBe(false);
    expect(sessionTitleIsDirty("Updated", "Session")).toBe(true);
    expect(sessionTitleIsDirty(" Session ", "Session")).toBe(false);
    const rich = { blockType: "rich_text" as const, title: "Lesson", richTextContent: richText, url: "", description: "" };
    expect(materialValuesAreEqual(rich, rich)).toBe(true);
    expect(materialValuesAreEqual(rich, { ...rich, title: "Updated" })).toBe(false);
    expect(materialValuesAreEqual(rich, { ...rich, richTextContent: { ...richText, content: [] } })).toBe(false);
    expect(materialValuesAreEqual(rich, { ...rich, title: "Lesson", richTextContent: richText })).toBe(true);
    expect(materialValuesAreEqual(video, video)).toBe(true);
    expect(materialValuesAreEqual(video, { ...video, title: "Updated" })).toBe(false);
    expect(materialValuesAreEqual(video, { ...video, url: "https://other.example" })).toBe(false);
    expect(materialValuesAreEqual(video, { ...video, description: "Updated" })).toBe(false);
    expect(materialValuesAreEqual(video, { ...video })).toBe(true);
  });

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
  it("uses one deterministic reorder path and validates publishing", () => {
    expect(reorderedBlockIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(movedBlockIds(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(movedBlockIds(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(canPublishSession("", [])).toBe("Enter a session title.");
    expect(canPublishSession("One", [])).toContain("at least one");
    expect(canPublishSession("One", [{ blockType: "rich_text", richTextContent: { type: "doc", content: [{ type: "paragraph" }] }, url: null }])).toBe("Rich Text material cannot be empty.");
    expect(canPublishSession("One", [{ blockType: "video_link", richTextContent: null, url: "https://example.com" }])).toBeNull();
  });
  it("keeps block content attached to stable IDs while moving", () => {
    const blocks = [{ id: "a", content: "Alpha" }, { id: "b", content: "Bravo" }, { id: "c", content: "Charlie" }];
    const order = reorderedBlockIds(blocks.map((block) => block.id), "c", "a");
    expect(order.map((id) => blocks.find((block) => block.id === id)?.content)).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(reorderedBlockIds(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(reorderedBlockIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(reorderedBlockIds(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
});
