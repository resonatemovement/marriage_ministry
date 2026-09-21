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
