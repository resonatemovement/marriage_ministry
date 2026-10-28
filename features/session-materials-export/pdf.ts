import "server-only";

import PDFDocument from "pdfkit";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { contentDispositionInline, resourceOpenUrl, safeHttpUrl, sanitizeSessionPdfFilename, type SessionMaterialsPdfBlock } from "./model";

const navy = "#0d2349";
const primary = "#41748d";
const secondary = "#50a684";
const ink = "#2d2e2c";
const muted = "#667078";
const pageBottom = 735;

function nodeText(node: unknown): string {
  if (!node || typeof node !== "object") throw new Error("Session text is malformed");
  const value = node as Record<string, unknown>;
  if (value.type === "text") return typeof value.text === "string" ? value.text : "";
  if (value.type === "hardBreak") return "\n";
  return Array.isArray(value.content) ? value.content.map(nodeText).join("") : "";
}

function assertRichTextSupported(node: unknown): void {
  if (!node || typeof node !== "object") throw new Error("Session text is malformed");
  const value = node as Record<string, unknown>;
  const supported = new Set(["doc", "paragraph", "heading", "text", "hardBreak", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule"]);
  if (typeof value.type !== "string" || !supported.has(value.type)) throw new Error("Session text contains unsupported content");
  for (const mark of textMarks(value)) {
    if (!["bold", "italic", "link"].includes(mark.type)) throw new Error("Session text contains unsupported formatting");
    if (mark.type === "link" && (typeof mark.attrs?.href !== "string" || !safeHttpUrl(mark.attrs.href))) throw new Error("Session text contains an invalid link");
  }
  if (Array.isArray(value.content)) value.content.forEach(assertRichTextSupported);
}

function textMarks(node: unknown) {
  const value = node as Record<string, unknown>;
  return Array.isArray(value.marks) ? value.marks as { type: string; attrs?: Record<string, unknown> }[] : [];
}

function addText(doc: PDFKit.PDFDocument, text: string, marks: { type: string; attrs?: Record<string, unknown> }[] = []) {
  const linkMark = marks.find((mark) => mark.type === "link");
  const link = typeof linkMark?.attrs?.href === "string" ? safeHttpUrl(linkMark.attrs.href) : null;
  const options: PDFKit.Mixins.TextOptions = { continued: true };
  if (link) options.link = link;
  const bold = marks.some((mark) => mark.type === "bold");
  const italic = marks.some((mark) => mark.type === "italic");
  doc.fillColor(ink).font(bold && italic ? "Helvetica-BoldOblique" : bold ? "Helvetica-Bold" : italic ? "Helvetica-Oblique" : "Helvetica").text(text, options);
}

function renderInline(doc: PDFKit.PDFDocument, node: unknown): void {
  if (!node || typeof node !== "object") return;
  const value = node as Record<string, unknown>;
  if (value.type === "text") addText(doc, typeof value.text === "string" ? value.text : "", textMarks(value));
  else if (value.type === "hardBreak") doc.text("\n", { continued: true });
  else if (Array.isArray(value.content)) value.content.forEach((child) => renderInline(doc, child));
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > pageBottom) doc.addPage();
}

function renderRichNode(doc: PDFKit.PDFDocument, node: unknown, depth = 0, orderedIndex = 0): void {
  if (!node || typeof node !== "object") throw new Error("Session text is malformed");
  const value = node as Record<string, unknown>;
  const children = Array.isArray(value.content) ? value.content : [];
  switch (value.type) {
    case "doc": children.forEach((child) => renderRichNode(doc, child)); return;
    case "paragraph":
      ensureSpace(doc, 38);
      children.forEach((child) => renderInline(doc, child));
      doc.text("", { continued: false, lineGap: 3 });
      doc.moveDown(0.45);
      return;
    case "heading": {
      const level = (value.attrs as Record<string, unknown> | undefined)?.level;
      const size = level === 1 ? 23 : level === 2 ? 18 : 14;
      doc.font("Helvetica-Bold").fontSize(size);
      ensureSpace(doc, doc.heightOfString(nodeText(value), { width: 496 }) + 24);
      doc.moveDown(0.35).fillColor(navy);
      children.forEach((child) => renderInline(doc, child));
      doc.text("", { continued: false });
      doc.fontSize(10.5).font("Helvetica").moveDown(0.4);
      return;
    }
    case "bulletList":
    case "orderedList":
      children.forEach((child, index) => renderRichNode(doc, child, depth + 1, value.type === "orderedList" ? index + 1 : 0));
      doc.moveDown(0.3);
      return;
    case "listItem": {
      const prefix = orderedIndex > 0 ? `${orderedIndex}.` : "•";
      doc.font("Helvetica").fontSize(10.5).fillColor(ink).text(prefix, 64 + depth * 14, doc.y, { continued: true, width: 24 });
      children.forEach((child) => {
        if (child && typeof child === "object" && (child as Record<string, unknown>).type === "paragraph") {
          const paragraph = child as Record<string, unknown>;
          if (Array.isArray(paragraph.content)) paragraph.content.forEach((inline) => renderInline(doc, inline));
        } else renderRichNode(doc, child, depth);
      });
      doc.text("", { continued: false });
      return;
    }
    case "blockquote":
      doc.save().rect(64 + depth * 14, doc.y, 3, Math.max(24, children.map((child) => nodeText(child).length).reduce((sum, length) => sum + Math.ceil(length / 90) * 13, 0))).fill(secondary).restore();
      doc.x = 76 + depth * 14;
      children.forEach((child) => renderRichNode(doc, child, depth + 1));
      return;
    case "codeBlock":
      ensureSpace(doc, 36);
      doc.font("Courier").fontSize(9).fillColor(ink).text(children.map(nodeText).join(""), { indent: 14, width: 470 });
      doc.font("Helvetica").fontSize(10.5).moveDown(0.5);
      return;
    case "horizontalRule":
      ensureSpace(doc, 20);
      doc.moveDown(0.3).moveTo(58, doc.y).lineTo(554, doc.y).strokeColor("#d8e1e4").stroke().moveDown(0.7);
      return;
    default: throw new Error("Session text contains unsupported content");
  }
}

async function logoPng() {
  const svg = await readFile(join(process.cwd(), "public/images/logo.svg"));
  return sharp(svg).resize({ width: 150 }).png().toBuffer();
}

export async function buildSessionMaterialsPdf(title: string, blocks: readonly SessionMaterialsPdfBlock[], baseUrl: string): Promise<{ bytes: Buffer; filename: string }> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 58, bottom: 76, left: 58, right: 58 }, bufferPages: true, info: { Title: title, Author: "Resonate Marriage Ministry", Subject: "Session Materials" } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const logo = await logoPng();
  doc.image(logo, 58, 34, { fit: [100, 28] });
  doc.font("Helvetica-Bold").fontSize(14).fillColor(navy).text("Resonate Marriage Ministry", 94, 40, { width: 250 });
  doc.font("Helvetica-Bold").fontSize(24).fillColor(navy);
  doc.text(title, 58, 86, { width: 496 });
  doc.moveDown(0.7).font("Helvetica").fontSize(10.5).fillColor(ink);

  for (const block of blocks) {
    if (block.title) {
      ensureSpace(doc, 38);
      doc.font("Helvetica-Bold").fontSize(16).fillColor(primary).text(block.title, { width: 496 });
      doc.moveDown(0.3).font("Helvetica").fontSize(10.5).fillColor(ink);
    }
    if (block.blockType === "rich_text") {
      if (!block.richTextContent) throw new Error("Session page content is missing");
      assertRichTextSupported(block.richTextContent);
      renderRichNode(doc, block.richTextContent);
    } else {
      if (block.description) {
        let parsed: unknown = null;
        try { parsed = JSON.parse(block.description) as unknown; } catch { /* Resource descriptions are plain text. */ }
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          assertRichTextSupported(parsed);
          renderRichNode(doc, parsed);
        } else doc.font("Helvetica").fontSize(10.5).fillColor(ink).text(block.description, { width: 496, lineGap: 3 }).moveDown(0.4);
      }
      if (block.blockType === "video_link") {
        const url = block.url ? safeHttpUrl(block.url) : null;
        if (!url) throw new Error("Session video link is invalid");
        ensureSpace(doc, 30);
        doc.fillColor(primary).font("Helvetica-Bold").text("Open video or link", { link: url, underline: true });
        doc.moveDown(0.7).fillColor(ink).font("Helvetica");
      } else {
        const url = block.resourceId && block.resourceVersionId ? resourceOpenUrl(baseUrl, block.resourceId, block.resourceVersionId) : null;
        if (!url) throw new Error("Pinned Resource link is invalid");
        if (block.image) {
          const sourceWidth = block.imageWidth ?? 496;
          const sourceHeight = block.imageHeight ?? 360;
          const scale = Math.min(496 / sourceWidth, 360 / sourceHeight, 1);
          const width = sourceWidth * scale;
          const height = sourceHeight * scale;
          ensureSpace(doc, height + 18);
          doc.image(block.image, 58, doc.y, { width, height });
          doc.y += height + 12;
        }
        doc.fillColor(primary).font("Helvetica-Bold").text("Open Resource in Resonate", { link: url, underline: true });
        doc.moveDown(0.7).fillColor(ink).font("Helvetica");
      }
    }
  }

  const pageRange = doc.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page++) {
    doc.switchToPage(page);
    doc.moveTo(58, pageBottom).lineTo(554, pageBottom).strokeColor("#d8e1e4").stroke();
    doc.font("Helvetica").fontSize(8.5).fillColor(muted).text("Resonate Marriage Ministry", 58, pageBottom + 10, { lineBreak: false });
    doc.text(`${page + 1} / ${pageRange.count}`, 492, pageBottom + 10, { width: 62, align: "right", lineBreak: false });
  }
  doc.end();
  return { bytes: await output, filename: sanitizeSessionPdfFilename(title) };
}

export { contentDispositionInline };
