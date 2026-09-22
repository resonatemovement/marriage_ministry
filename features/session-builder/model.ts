import type { MaterialBlockType } from "./types";

export const SESSION_STATUSES = ["draft", "published", "archived"] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionLifecycleAction = "archive" | "restore";

const SESSION_LIFECYCLE_ACTIONS = ["archive", "restore"] as const;

const lifecycleTransitions: Record<SessionLifecycleAction, { from: readonly SessionStatus[]; to: SessionStatus }> = {
  archive: { from: ["draft", "published"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};

const labels: Record<SessionStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function isSessionStatus(value: string | undefined): value is SessionStatus {
  return SESSION_STATUSES.includes(value as SessionStatus);
}

export function isSessionLifecycleAction(value: string): value is SessionLifecycleAction {
  return SESSION_LIFECYCLE_ACTIONS.includes(value as SessionLifecycleAction);
}

export function sessionStatusLabel(status: SessionStatus) {
  return labels[status];
}

export function normalizeSessionTitle(value: string) {
  return value.trim();
}

export function sessionTitleIsDirty(value: string, persistedValue: string) {
  return normalizeSessionTitle(value) !== normalizeSessionTitle(persistedValue);
}

export function materialValuesAreEqual(first: { blockType: MaterialBlockType; title: string; richTextContent: Record<string, unknown>; url: string; description: string }, second: { blockType: MaterialBlockType; title: string; richTextContent: Record<string, unknown>; url: string; description: string }) {
  return first.blockType === second.blockType
    && normalizeSessionTitle(first.title) === normalizeSessionTitle(second.title)
    && JSON.stringify(first.richTextContent) === JSON.stringify(second.richTextContent)
    && first.url.trim() === second.url.trim()
    && normalizeSessionTitle(first.description) === normalizeSessionTitle(second.description);
}

export function isValidMaterialUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function materialUrlFrom(formData: FormData) {
  const value = formData.get("url");
  return typeof value === "string" ? value.trim() : "";
}

export function richTextLinkAttributes(href: string, openInNewTab: boolean) {
  return openInNewTab ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };
}

export function reorderedBlockIds(ids: string[], activeId: string, overId: string) { const from = ids.indexOf(activeId); const to = ids.indexOf(overId); if (from < 0 || to < 0) return ids; const next = [...ids]; next.splice(from, 1); next.splice(to, 0, activeId); return next; }
export function movedBlockIds(ids: string[], id: string, direction: -1 | 1) { const index = ids.indexOf(id); const next = index + direction; return index < 0 || next < 0 || next >= ids.length ? ids : reorderedBlockIds(ids, id, ids[next]); }
export function canPublishSession(title: string, blocks: Array<{ blockType: MaterialBlockType; richTextContent: Record<string, unknown> | null; url: string | null }>) { if (!normalizeSessionTitle(title)) return "Enter a session title."; if (!blocks.length) return "Add at least one Session Material block before publishing."; for (const block of blocks) { if (block.blockType === "rich_text" && !richTextHasMeaningfulContent(block.richTextContent)) return "Rich Text material cannot be empty."; if (block.blockType === "video_link" && !isValidMaterialUrl(block.url ?? "")) return "Enter a valid http or https URL for the Video / Link block."; } return null; }

export function richTextHasMeaningfulContent(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const node = value as { type?: string; text?: string; content?: unknown[] };
  if (typeof node.text === "string" && node.text.trim()) return true;
  return Array.isArray(node.content) && node.content.some(richTextHasMeaningfulContent);
}

export function materialPreview(block: { blockType: MaterialBlockType; title: string | null; richTextContent: Record<string, unknown> | null; url: string | null; description: string | null }) {
  if (block.title?.trim()) return block.title.trim();
  if (block.blockType === "video_link") return block.url ?? "Video / Link";
  return richTextPreview(block.richTextContent) || "Rich Text";
}

function richTextPreview(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: string; content?: unknown[] };
  if (typeof node.text === "string") return node.text.trim();
  return Array.isArray(node.content) ? node.content.map(richTextPreview).join(" ").replace(/\s+/g, " ").trim() : "";
}

export function sessionLifecycleTarget(status: SessionStatus, action: SessionLifecycleAction): SessionStatus | null {
  const transition = lifecycleTransitions[action];
  return transition.from.includes(status) ? transition.to : null;
}

export function sessionLifecycleTransition(action: SessionLifecycleAction) {
  return lifecycleTransitions[action];
}
