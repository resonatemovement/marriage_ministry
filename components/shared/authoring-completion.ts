export function richTextHasMeaningfulContent(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const node = value as { text?: string; content?: unknown[] };
  if (typeof node.text === "string" && node.text.trim()) return true;
  return Array.isArray(node.content) && node.content.some(richTextHasMeaningfulContent);
}

export function richTextBlockIsComplete(title: string | null, content: unknown, requireTitle = true) {
  return (!requireTitle || Boolean(title?.trim())) && richTextHasMeaningfulContent(content);
}

export function videoLinkIsComplete(values: { title: string; url: string; description: string }, validateUrl: (value: string) => boolean) {
  return Boolean(values.title.trim() && values.url.trim() && values.description.trim()) && validateUrl(values.url);
}
