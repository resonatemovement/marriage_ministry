import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./resource-actions", () => ({ findSessionResources: vi.fn() }));

import { RESOURCE_PICKER_COPY, SessionResourcePickerCard } from "./session-resource-picker";
import type { ResourceLibraryItem } from "@/features/resource-library/presentation";

const resources: ResourceLibraryItem[] = [
  { id: "image", title: "Cover image", description: null, category: "image", archivedAt: null, createdAt: "", updatedAt: "", canManage: false,
    currentVersion: { originalFilename: "cover.avif", mimeType: "image/avif", sizeBytes: 1024, uploadedAt: "" }, previewUrl: "https://signed.example/cover" },
  { id: "document", title: "Couple guide", description: null, category: "document", archivedAt: null, createdAt: "", updatedAt: "", canManage: false,
    currentVersion: { originalFilename: "guide.pdf", mimeType: "application/pdf", sizeBytes: 2048, uploadedAt: "" }, previewUrl: null },
  { id: "audio", title: "Audio lesson", description: null, category: "audio", archivedAt: null, createdAt: "", updatedAt: "", canManage: false,
    currentVersion: { originalFilename: "lesson.mp3", mimeType: "audio/mpeg", sizeBytes: 4096, uploadedAt: "" }, previewUrl: null },
  { id: "video", title: "Session video", description: null, category: "video", archivedAt: null, createdAt: "", updatedAt: "", canManage: false,
    currentVersion: { originalFilename: "session.mp4", mimeType: "video/mp4", sizeBytes: 8192, uploadedAt: "" }, previewUrl: null },
];
const searchPlaceholders = { image: "Search images...", document: "Search documents...", audio: "Search audio...", video: "Search videos..." } as const;

describe("responsive Session Resource picker presentation", () => {
  it.each(["image", "document", "audio", "video"] as const)("provides type-specific modal copy for %s", (category) => {
    expect(RESOURCE_PICKER_COPY[category].title).toBe(`Select ${category[0].toUpperCase()}${category.slice(1)}`);
    expect(RESOURCE_PICKER_COPY[category].description).toContain("Resource Library");
    expect(RESOURCE_PICKER_COPY[category].search).toBe(searchPlaceholders[category]);
    expect(RESOURCE_PICKER_COPY[category].empty).not.toContain("No matching");
    expect(RESOURCE_PICKER_COPY[category].searchEmpty).toContain("search");
  });

  it("renders a preview-first, keyboard-selectable Image card", () => {
    const markup = renderToStaticMarkup(createElement(SessionResourcePickerCard, { item: resources[0], category: "image", onSelect: vi.fn() }));
    expect(markup).toContain('aria-label="Select Cover image"');
    expect(markup).toContain('alt="Preview of Cover image"');
    expect(markup).toContain("https://signed.example/cover");
    expect(markup).toContain("Cover image");
    expect(markup).toContain("AVIF · 1 KB");
  });

  it.each([["document", "guide.pdf", "PDF · 2 KB"], ["audio", "lesson.mp3", "MP3 · 4 KB"], ["video", "session.mp4", "MP4 · 8 KB"]] as const)(
    "renders a browseable %s file card without player controls",
    (category, filename, detail) => {
      const item = resources.find((resource) => resource.category === category)!;
      const markup = renderToStaticMarkup(createElement(SessionResourcePickerCard, { item, category, onSelect: vi.fn() }));
      expect(markup).toContain(`aria-label="Select ${item.title}"`);
      expect(markup).toContain(item.title);
      expect(markup).not.toContain(filename);
      expect(markup).toContain(detail);
      expect(markup).not.toContain("<audio");
      expect(markup).not.toContain("<video");
    },
  );
});
