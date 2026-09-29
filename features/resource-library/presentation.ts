import type { ResourceCategory } from "./policy";

export type ResourceLibraryItem = {
  id: string;
  title: string;
  description: string | null;
  category: ResourceCategory;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
  currentVersion: {
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  };
  previewUrl: string | null;
};

export type ResourceCategoryFilter = ResourceCategory | "all";

export const RESOURCE_CATEGORY_FILTERS: readonly { value: ResourceCategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "document", label: "Documents" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
];

export function filterResourceItems(
  items: readonly ResourceLibraryItem[],
  category: ResourceCategoryFilter,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!query) return true;
    return [item.title, item.description, item.currentVersion.originalFilename]
      .some((value) => value?.toLocaleLowerCase().includes(query));
  });
}

export function resourceEmptyState(allItems: readonly ResourceLibraryItem[], visibleItems: readonly ResourceLibraryItem[], category: ResourceCategoryFilter, search: string, archived: boolean) {
  if (!allItems.length) return archived ? "no-archived" : "no-resources";
  if (!visibleItems.length && search.trim()) return "no-search-results";
  if (!visibleItems.length && category !== "all") return "no-category-results";
  return null;
}
