import { describe, expect, it } from "vitest";
import { filterResourceItems, resourceEmptyState, sessionResourcePickerEmptyState, type ResourceLibraryItem } from "./presentation";

const items: ResourceLibraryItem[] = [
  { id: "image", title: "Wedding guide", description: "A couple's guide", category: "image", archivedAt: null, createdAt: "2026-09-29", updatedAt: "2026-09-29", canManage: true,
    currentVersion: { originalFilename: "cover.avif", mimeType: "image/avif", sizeBytes: 1024, uploadedAt: "2026-09-29" }, previewUrl: null },
  { id: "doc", title: "Questions", description: null, category: "document", archivedAt: null, createdAt: "2026-09-29", updatedAt: "2026-09-29", canManage: false,
    currentVersion: { originalFilename: "Conflict Questions.pdf", mimeType: "application/pdf", sizeBytes: 2048, uploadedAt: "2026-09-29" }, previewUrl: null },
  { id: "audio", title: "Audio Guide", description: null, category: "audio", archivedAt: null, createdAt: "2026-09-29", updatedAt: "2026-09-29", canManage: false,
    currentVersion: { originalFilename: "guide.mp3", mimeType: "audio/mpeg", sizeBytes: 4096, uploadedAt: "2026-09-29" }, previewUrl: null },
  { id: "video", title: "Video Guide", description: null, category: "video", archivedAt: null, createdAt: "2026-09-29", updatedAt: "2026-09-29", canManage: false,
    currentVersion: { originalFilename: "guide.mp4", mimeType: "video/mp4", sizeBytes: 8192, uploadedAt: "2026-09-29" }, previewUrl: null },
];

describe("Resource Library presentation model", () => {
  it("filters by category and case-insensitive title, description, and current filename", () => {
    expect(filterResourceItems(items, "image", "").map((item) => item.id)).toEqual(["image"]);
    expect(filterResourceItems(items, "all", "QUESTIONS").map((item) => item.id)).toEqual(["doc"]);
    expect(filterResourceItems(items, "all", "couple's").map((item) => item.id)).toEqual(["image"]);
    expect(["image", "document", "audio", "video"].map((category) => filterResourceItems(items, category as ResourceLibraryItem["category"], "").map((item) => item.category)))
      .toEqual([["image"], ["document"], ["audio"], ["video"]]);
    expect(filterResourceItems(items, "video", "guide").map((item) => item.currentVersion.originalFilename)).toEqual(["guide.mp4"]);
  });

  it("selects distinct empty states for first-use, archived, search, and category views", () => {
    expect(resourceEmptyState([], [], "all", "", false)).toBe("no-resources");
    expect(resourceEmptyState([], [], "all", "", true)).toBe("no-archived");
    expect(resourceEmptyState(items, [], "all", "missing", false)).toBe("no-search-results");
    expect(resourceEmptyState(items, [], "audio", "", false)).toBe("no-category-results");
    expect(resourceEmptyState(items, items, "all", "", false)).toBeNull();
  });

  it("distinguishes a category with no active Resources from a search with no matches", () => {
    expect(sessionResourcePickerEmptyState([], [], "")).toBe("no-resources");
    expect(sessionResourcePickerEmptyState([], [], "missing")).toBe("no-search-results");
    expect(sessionResourcePickerEmptyState(items, [], "missing")).toBe("no-search-results");
    expect(sessionResourcePickerEmptyState(items, items, "")).toBeNull();
  });
});
