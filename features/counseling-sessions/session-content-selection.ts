import type { SessionContentOption } from "./model";

export function sessionContentListNeedsScroll(itemCount: number) {
  return itemCount > 4;
}

export function recommendedSessionContentIds(content: readonly SessionContentOption[]) {
  return content.filter((item) => item.isRecommended).map((item) => item.id);
}

export function toggleSessionContentId(selectedIds: readonly string[], id: string, checked: boolean) {
  if (checked) return selectedIds.includes(id) ? [...selectedIds] : [...selectedIds, id];
  return selectedIds.filter((selectedId) => selectedId !== id);
}
