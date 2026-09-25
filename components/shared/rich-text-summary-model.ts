type RichTextNode = { type?: string; text?: string; content?: unknown[] };

export type RichTextSummaryData = {
  title: string;
  body: string;
};

export function richTextSummary(content: unknown, explicitTitle: string | null): RichTextSummaryData {
  const firstHeading = firstMeaningfulHeading(content);
  const normalizedExplicitTitle = normalizeMeaningfulText(explicitTitle ?? "");
  const title = normalizedExplicitTitle || firstHeading?.text || "";
  const omitHeading = firstHeading !== null && (!normalizedExplicitTitle || normalizedExplicitTitle === firstHeading.text);
  return {
    title,
    body: extractRichTextText(content, omitHeading ? firstHeading.node : null).trim(),
  };
}

export function normalizeMeaningfulText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function richTextSummaryOverflows(scrollHeight: number, clientHeight: number) {
  return scrollHeight > clientHeight + 1;
}

function firstMeaningfulHeading(value: unknown): { node: unknown; text: string } | null {
  if (Array.isArray(value)) {
    for (const child of value) {
      const heading = firstMeaningfulHeading(child);
      if (heading) return heading;
    }
    return null;
  }
  if (!isRichTextNode(value)) return null;
  if (value.type === "heading") {
    const text = normalizeMeaningfulText(extractRichTextText(value));
    if (text) return { node: value, text };
  }
  return firstMeaningfulHeading(value.content);
}

function extractRichTextText(value: unknown, skipNode: unknown = null): string {
  if (value === skipNode) return "";
  if (Array.isArray(value)) return value.map((child) => extractRichTextText(child, skipNode)).filter(Boolean).join("");
  if (!isRichTextNode(value)) return "";
  if (value.type === "text") return typeof value.text === "string" ? value.text : "";
  if (value.type === "hardBreak") return "\n";
  const children = Array.isArray(value.content)
    ? value.content.map((child) => extractRichTextText(child, skipNode)).filter(Boolean)
    : [];
  const separator = ["doc", "bulletList", "orderedList", "listItem", "blockquote"].includes(value.type ?? "") ? "\n" : "";
  return children.join(separator);
}

function isRichTextNode(value: unknown): value is RichTextNode {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
