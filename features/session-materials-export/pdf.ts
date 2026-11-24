import "server-only";

import PDFDocument from "pdfkit";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resourceOpenUrl, safeHttpUrl, sanitizeSessionPdfFilename, type SessionMaterialsPdfBlock } from "./model";

const navy = "#0d2349";
const primary = "#41748d";
const secondary = "#50a684";
const ink = "#2d2e2c";
const muted = "#667078";
const bodyFont = "Helvetica";
const bodyFontSize = 10.5;
const bodyLineGap = 3;
const paragraphGap = 8;
const pageMargins = { top: 58, bottom: 122, left: 58, right: 58 };
const footerLineOffset = 115;
const footerTextOffset = 105;
const listMarkerWidth = 24;

type RichMark = { type: string; attrs?: Record<string, unknown> };
type RichNode = Record<string, unknown>;
type RichRun = { text: string; marks: RichMark[] };
type Layout = { left: number; right: number; listLevel?: number; paragraphGap?: number };
type ListMarker = { text: string; level: number };

function childrenOf(node: RichNode): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function nodeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const value = node as RichNode;
  if (value.type === "text") return typeof value.text === "string" ? value.text : "";
  if (value.type === "hardBreak") return "\n";
  return childrenOf(value).map(nodeText).join("");
}

function textMarks(node: unknown): RichMark[] {
  const value = node as RichNode;
  return Array.isArray(value.marks) ? value.marks as RichMark[] : [];
}

function assertRichTextSupported(node: unknown): void {
  if (!node || typeof node !== "object") throw new Error("Session text is malformed");
  const value = node as RichNode;
  const supportedNodes = new Set(["doc", "paragraph", "heading", "text", "hardBreak", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule"]);
  const supportedMarks = new Set(["bold", "italic", "underline", "strike", "code", "link"]);
  if (typeof value.type !== "string" || !supportedNodes.has(value.type)) throw new Error("Session text contains unsupported content");
  for (const mark of textMarks(value)) {
    if (!supportedMarks.has(mark.type)) throw new Error("Session text contains unsupported formatting");
    if (mark.type === "link") {
      const href = mark.attrs?.href;
      const hasHref = href !== undefined && href !== null && !(typeof href === "string" && href.trim() === "");
      if (hasHref && (typeof href !== "string" || !safeHttpUrl(href))) throw new Error("Session text contains an invalid link");
    }
  }
  childrenOf(value).forEach(assertRichTextSupported);
}

function collectInlineRuns(node: unknown, inheritedMarks: RichMark[] = []): RichRun[] {
  if (!node || typeof node !== "object") return [];
  const value = node as RichNode;
  const marks = [...inheritedMarks, ...textMarks(value)];
  if (value.type === "text") return typeof value.text === "string" && value.text ? [{ text: value.text, marks }] : [];
  if (value.type === "hardBreak") return [{ text: "\n", marks }];
  return childrenOf(value).flatMap((child) => collectInlineRuns(child, marks));
}

function inlineFont(marks: RichMark[]): string {
  const code = marks.some((mark) => mark.type === "code");
  const bold = marks.some((mark) => mark.type === "bold");
  const italic = marks.some((mark) => mark.type === "italic");
  if (code) return bold && italic ? "Courier-BoldOblique" : bold ? "Courier-Bold" : italic ? "Courier-Oblique" : "Courier";
  return bold && italic ? "Helvetica-BoldOblique" : bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : bodyFont;
}

function contentWidth(layout: Layout) {
  return Math.max(1, layout.right - layout.left);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  const top = doc.page.margins.top;
  const maxY = doc.page.maxY();
  const availablePageHeight = Math.max(1, maxY - top);
  const reservedHeight = Math.min(Math.max(0, height), availablePageHeight);
  if (doc.y > top && doc.y + reservedHeight > maxY) doc.addPage();
}

function paragraphHeight(doc: PDFKit.PDFDocument, text: string, width: number, fontSize = bodyFontSize) {
  doc.font(bodyFont).fontSize(fontSize);
  return Math.max(doc.currentLineHeight(true), doc.heightOfString(text || " ", { width, lineGap: bodyLineGap }));
}

function renderRuns(doc: PDFKit.PDFDocument, runs: RichRun[], layout: Layout, fontSize: number, color: string, gapAfter = 0) {
  const width = contentWidth(layout);
  const text = runs.map((run) => run.text).join("");
  const measuredHeight = paragraphHeight(doc, text, width, fontSize);
  const firstLineHeight = doc.currentLineHeight(true) + bodyLineGap;
  const availableHeight = doc.page.maxY() - doc.y;
  ensureSpace(doc, measuredHeight <= availableHeight ? measuredHeight : firstLineHeight);
  const startY = doc.y;
  const textOptions = (run: RichRun, continued: boolean): PDFKit.Mixins.TextOptions => {
    const linkMark = run.marks.find((mark) => mark.type === "link");
    const href = typeof linkMark?.attrs?.href === "string" ? safeHttpUrl(linkMark.attrs.href) : null;
    return {
      width,
      lineGap: bodyLineGap,
      continued,
      underline: run.marks.some((mark) => mark.type === "underline"),
      strike: run.marks.some((mark) => mark.type === "strike"),
      ...(href ? { link: href } : {}),
    };
  };

  if (runs.length === 0) {
    doc.font(bodyFont).fontSize(fontSize).fillColor(color).text(" ", layout.left, startY, { width, lineGap: bodyLineGap });
  } else {
    runs.forEach((run, index) => {
      const options = textOptions(run, index < runs.length - 1);
      doc.font(inlineFont(run.marks)).fontSize(fontSize).fillColor(color);
      if (index === 0) doc.text(run.text, layout.left, startY, options);
      else doc.text(run.text, options);
    });
  }

  doc.font(bodyFont).fontSize(fontSize).fillColor(color);
  doc.x = layout.left;
  doc.y += gapAfter;
}

function reserveHeadingAndStart(doc: PDFKit.PDFDocument, heading: RichNode, following: unknown, layout: Layout) {
  const level = (heading.attrs as Record<string, unknown> | undefined)?.level;
  const fontSize = level === 1 ? 23 : level === 2 ? 18 : 14;
  const headingText = nodeText(heading);
  doc.font("Helvetica-Bold").fontSize(fontSize);
  const headingHeight = doc.heightOfString(headingText || " ", { width: contentWidth(layout), lineGap: bodyLineGap });
  const nextNode = following && typeof following === "object" ? following as RichNode : null;
  const nextSize = nextNode?.type === "heading"
    ? ((nextNode.attrs as Record<string, unknown> | undefined)?.level === 1 ? 23 : (nextNode.attrs as Record<string, unknown> | undefined)?.level === 2 ? 18 : 14)
    : bodyFontSize;
  const firstContentLine = Math.max(doc.currentLineHeight(true), nextSize * 1.2) + bodyLineGap;
  ensureSpace(doc, headingHeight + (following ? firstContentLine + 5 : 0));
}

function renderRichChildren(doc: PDFKit.PDFDocument, nodes: unknown[], layout: Layout) {
  nodes.forEach((child, index) => {
    if (child && typeof child === "object" && (child as RichNode).type === "heading") {
      reserveHeadingAndStart(doc, child as RichNode, nodes[index + 1], layout);
    }
    renderRichNode(doc, child, layout);
  });
}

function renderListItem(doc: PDFKit.PDFDocument, node: RichNode, layout: Layout, marker: ListMarker) {
  const markerX = layout.left;
  const bodyLeft = markerX + listMarkerWidth;
  const bodyLayout: Layout = { ...layout, left: bodyLeft, listLevel: marker.level + 1, paragraphGap: 3 };
  const firstParagraph = childrenOf(node).find((child) => child && typeof child === "object" && (child as RichNode).type === "paragraph") as RichNode | undefined;
  const firstText = firstParagraph ? nodeText(firstParagraph) : "";
  const bodyHeight = firstText ? paragraphHeight(doc, firstText, contentWidth(bodyLayout)) : doc.currentLineHeight(true);
  const pageContentHeight = doc.page.maxY() - doc.page.margins.top;
  ensureSpace(doc, bodyHeight <= pageContentHeight ? bodyHeight : doc.currentLineHeight(true) + bodyLineGap);

  const startY = doc.y;
  doc.font(bodyFont).fontSize(bodyFontSize).fillColor(ink)
    .text(marker.text, markerX, startY, { width: listMarkerWidth - 3, lineBreak: false });
  doc.y = startY;
  doc.x = bodyLeft;
  renderRichChildren(doc, childrenOf(node), bodyLayout);
  doc.y += 3;
  doc.x = layout.left;
}

function drawBlockquoteRule(doc: PDFKit.PDFDocument, firstPage: number, lastPage: number, startY: number, endY: number, x: number) {
  const currentPage = lastPage;
  const currentY = doc.y;
  const currentX = doc.x;
  for (let pageIndex = firstPage; pageIndex <= lastPage; pageIndex++) {
    doc.switchToPage(pageIndex);
    const page = doc.page;
    const top = page.margins.top;
    const bottom = page.maxY();
    const y1 = pageIndex === firstPage ? startY : top;
    const y2 = pageIndex === lastPage ? endY : bottom;
    if (y2 <= y1) continue;
    doc.save().lineWidth(3).strokeColor(secondary).moveTo(x + 5, y1).lineTo(x + 5, y2).stroke().restore();
  }
  doc.switchToPage(currentPage);
  doc.y = currentY;
  doc.x = currentX;
}

function renderRichNode(doc: PDFKit.PDFDocument, node: unknown, layout: Layout, marker?: ListMarker): void {
  if (!node || typeof node !== "object") throw new Error("Session text is malformed");
  const value = node as RichNode;
  const children = childrenOf(value);

  switch (value.type) {
    case "doc":
      renderRichChildren(doc, children, layout);
      return;
    case "paragraph":
      renderRuns(doc, collectInlineRuns(value), layout, bodyFontSize, ink, layout.paragraphGap ?? paragraphGap);
      return;
    case "heading": {
      const level = (value.attrs as Record<string, unknown> | undefined)?.level;
      const fontSize = level === 1 ? 23 : level === 2 ? 18 : 14;
      renderRuns(doc, collectInlineRuns(value), layout, fontSize, navy, 7);
      return;
    }
    case "bulletList": {
      const level = layout.listLevel ?? 0;
      const bullet = level === 0 ? "•" : level === 1 ? "◦" : "▪";
      children.forEach((child) => renderRichNode(doc, child, layout, { text: bullet, level }));
      doc.y += 2;
      return;
    }
    case "orderedList": {
      const attrs = value.attrs as Record<string, unknown> | undefined;
      const start = typeof attrs?.start === "number" && Number.isInteger(attrs.start) && attrs.start > 0 ? attrs.start : 1;
      const level = layout.listLevel ?? 0;
      children.forEach((child, index) => renderRichNode(doc, child, layout, { text: `${start + index}.`, level }));
      doc.y += 2;
      return;
    }
    case "listItem":
      renderListItem(doc, value, layout, marker ?? { text: "•", level: layout.listLevel ?? 0 });
      return;
    case "blockquote": {
      const pageRange = doc.bufferedPageRange();
      const firstPage = pageRange.start + pageRange.count - 1;
      const startY = doc.y;
      const quoteLayout: Layout = { ...layout, left: layout.left + 16, paragraphGap: 5 };
      renderRichChildren(doc, children, quoteLayout);
      const nextRange = doc.bufferedPageRange();
      const lastPage = nextRange.start + nextRange.count - 1;
      drawBlockquoteRule(doc, firstPage, lastPage, startY, doc.y, layout.left);
      doc.y += 4;
      doc.x = layout.left;
      return;
    }
    case "codeBlock": {
      const text = children.map(nodeText).join("");
      const width = contentWidth(layout);
      ensureSpace(doc, paragraphHeight(doc, text, width, 9));
      doc.font("Courier").fontSize(9);
      doc.fillColor(ink).text(text || " ", layout.left, doc.y, { width, lineGap: bodyLineGap });
      doc.font(bodyFont).fontSize(bodyFontSize).fillColor(ink);
      doc.y += 8;
      doc.x = layout.left;
      return;
    }
    case "horizontalRule":
      ensureSpace(doc, 20);
      doc.y += 5;
      doc.moveTo(layout.left, doc.y).lineTo(layout.right, doc.y).strokeColor("#d8e1e4").stroke();
      doc.y += 10;
      doc.x = layout.left;
      return;
    default:
      throw new Error("Session text contains unsupported content");
  }
}

async function logoPng() {
  const svg = await readFile(join(process.cwd(), "public/images/logo.svg"));
  return sharp(svg).resize({ width: 150 }).png().toBuffer();
}

export async function buildSessionMaterialsPdf(title: string, blocks: readonly SessionMaterialsPdfBlock[], baseUrl: string): Promise<{ bytes: Buffer; filename: string }> {
  const doc = new PDFDocument({ size: "LETTER", margins: pageMargins, bufferPages: true, info: { Title: title, Author: "Resonate Marriage Ministry", Subject: "Session Materials" } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const layout: Layout = { left: pageMargins.left, right: 612 - pageMargins.right };
  const logo = await logoPng();
  doc.image(logo, pageMargins.left, 34, { fit: [100, 28] });
  doc.font("Helvetica-Bold").fontSize(14).fillColor(navy).text("Resonate Marriage Ministry", 94, 40, { width: 250 });
  doc.y = 86;
  doc.font("Helvetica-Bold").fontSize(24).fillColor(navy);
  const titleHeight = doc.heightOfString(title, { width: contentWidth(layout) });
  ensureSpace(doc, titleHeight + 15);
  doc.text(title, layout.left, doc.y, { width: contentWidth(layout) });
  doc.font(bodyFont).fontSize(bodyFontSize).fillColor(ink);
  doc.y += 10;

  for (const block of blocks) {
    const richText = block.blockType === "rich_text" ? block.richTextContent : null;
    if (richText) assertRichTextSupported(richText);
    if (block.title) {
      doc.font("Helvetica-Bold").fontSize(16);
      const blockTitleHeight = doc.heightOfString(block.title, { width: contentWidth(layout) });
      let followingContentHeight = doc.currentLineHeight(true) + 8;
      const firstRichNode = richText && typeof richText === "object" ? childrenOf(richText as RichNode)[0] as RichNode | undefined : undefined;
      if (firstRichNode?.type === "heading") {
        const level = (firstRichNode.attrs as Record<string, unknown> | undefined)?.level;
        const headingSize = level === 1 ? 23 : level === 2 ? 18 : 14;
        doc.font("Helvetica-Bold").fontSize(headingSize);
        const firstHeadingHeight = doc.heightOfString(nodeText(firstRichNode) || " ", { width: contentWidth(layout), lineGap: bodyLineGap });
        const nextRichNode = childrenOf(richText as RichNode)[1] as RichNode | undefined;
        const nextSize = nextRichNode?.type === "heading"
          ? ((nextRichNode.attrs as Record<string, unknown> | undefined)?.level === 1 ? 23 : (nextRichNode.attrs as Record<string, unknown> | undefined)?.level === 2 ? 18 : 14)
          : bodyFontSize;
        followingContentHeight = firstHeadingHeight + Math.max(doc.currentLineHeight(true), nextSize * 1.2) + 12;
        doc.font("Helvetica-Bold").fontSize(16);
      }
      ensureSpace(doc, blockTitleHeight + followingContentHeight + 7);
      doc.fillColor(primary).text(block.title, layout.left, doc.y, { width: contentWidth(layout) });
      doc.font(bodyFont).fontSize(bodyFontSize).fillColor(ink);
      doc.y += 7;
    }
    if (block.blockType === "rich_text") {
      if (!richText) throw new Error("Session page content is missing");
      renderRichNode(doc, richText, layout);
      continue;
    }

    if (block.description) {
      let parsed: unknown = null;
      try { parsed = JSON.parse(block.description) as unknown; } catch { /* Resource descriptions are plain text. */ }
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        assertRichTextSupported(parsed);
        renderRichNode(doc, parsed, layout);
      } else {
        const descriptionHeight = paragraphHeight(doc, block.description, contentWidth(layout));
        ensureSpace(doc, descriptionHeight);
        doc.font(bodyFont).fontSize(bodyFontSize).fillColor(ink)
          .text(block.description, layout.left, doc.y, { width: contentWidth(layout), lineGap: bodyLineGap });
        doc.y += 7;
      }
    }
    if (block.blockType === "video_link") {
      const url = block.url ? safeHttpUrl(block.url) : null;
      if (!url) throw new Error("Session video link is invalid");
      ensureSpace(doc, doc.currentLineHeight(true) + 8);
      doc.fillColor(primary).font("Helvetica-Bold").text("Open video or link", layout.left, doc.y, { width: contentWidth(layout), link: url, underline: true });
      doc.font(bodyFont).fillColor(ink);
      doc.y += 8;
      continue;
    }

    const url = block.resourceId && block.resourceVersionId ? resourceOpenUrl(baseUrl, block.resourceId, block.resourceVersionId) : null;
    if (!url) throw new Error("Pinned Resource link is invalid");
    if (block.image) {
      const sourceWidth = block.imageWidth ?? 496;
      const sourceHeight = block.imageHeight ?? 360;
      const scale = Math.min(contentWidth(layout) / sourceWidth, 360 / sourceHeight, 1);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      ensureSpace(doc, height + 12);
      doc.image(block.image, layout.left, doc.y, { width, height });
      doc.y += height + 12;
    }
    ensureSpace(doc, doc.currentLineHeight(true) + 8);
    doc.fillColor(primary).font("Helvetica-Bold").text("Open Resource in Resonate", layout.left, doc.y, { width: contentWidth(layout), link: url, underline: true });
    doc.font(bodyFont).fillColor(ink);
    doc.y += 8;
  }

  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex++) {
    doc.switchToPage(pageIndex);
    const footerY = doc.page.height - footerLineOffset;
    const footerTextY = doc.page.height - footerTextOffset;
    const contentBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 40;
    doc.moveTo(pageMargins.left, footerY).lineTo(doc.page.width - pageMargins.right, footerY).strokeColor("#d8e1e4").stroke();
    doc.font(bodyFont).fontSize(8.5).fillColor(muted).text("Resonate Marriage Ministry", pageMargins.left, footerTextY, { lineBreak: false });
    doc.text(`${pageIndex - pageRange.start + 1} / ${pageRange.count}`, doc.page.width - pageMargins.right - 62, footerTextY, { width: 62, align: "right", lineBreak: false });
    doc.page.margins.bottom = contentBottomMargin;
  }
  doc.end();
  return { bytes: await output, filename: sanitizeSessionPdfFilename(title) };
}
