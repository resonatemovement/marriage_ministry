import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { inflateSync } from "node:zlib";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { buildSessionMaterialsPdf } from "./pdf";
import { sessionSnapshotOrder, type SessionMaterialsPdfBlock } from "./model";

const page = (id: string, position: number, content: string): SessionMaterialsPdfBlock => ({
  id, position, blockType: "rich_text", title: id, richTextContent: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: content }] }, { type: "paragraph", content: [{ type: "text", text: `Included ${content}`, marks: [{ type: "bold" }] }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "List item" }] }] }] }] }, url: null, description: null, resourceId: null, resourceVersionId: null, resourceCategory: null, image: null, imageWidth: null, imageHeight: null,
});

function decodedPdfText(pdf: Buffer) {
  const streams = [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  const textStreams = streams.flatMap(([, stream]) => {
    try { return [inflateSync(Buffer.from(stream, "latin1")).toString("latin1")]; } catch { return []; }
  });
  return textStreams.flatMap((stream) => [...stream.matchAll(/<([0-9a-f]+)>/gi)].map(([, text]) => Buffer.from(text, "hex").toString("latin1"))).join("");
}

describe("assigned Session Materials PDF", () => {
  it("places the Resonate brand name in the PDF header above the Session title", async () => {
    const { bytes } = await buildSessionMaterialsPdf("Marriage Connection", [], "https://app.example");
    const content = decodedPdfText(bytes);
    expect(content.indexOf("Resonate Marriage Ministry")).toBeGreaterThanOrEqual(0);
    expect(content.indexOf("Marriage Connection")).toBeGreaterThan(content.indexOf("Resonate Marriage Ministry"));
  });

  it("keeps selected snapshot order and emits a US Letter PDF with only supplied blocks", async () => {
    const ordered = sessionSnapshotOrder([page("Second", 2, "Selected second"), page("First", 1, "Selected first")]);
    expect(ordered.map(({ id }) => id)).toEqual(["First", "Second"]);
    const { bytes, filename } = await buildSessionMaterialsPdf("Marriage Connection", ordered, "https://app.example");
    expect(filename).toBe("Marriage Connection.pdf");
    expect(bytes.subarray(0, 8).toString("ascii")).toBe("%PDF-1.3");
    expect(bytes.toString("latin1")).toContain("/MediaBox [0 0 612 792]");
    expect(bytes.toString("latin1")).not.toContain("Excluded current curriculum");
  });

  it("includes a protected pinned Resource route and safe clickable external URL", async () => {
    const blocks = [
      { ...page("Resource", 1, "Resource text"), blockType: "library_resource" as const, title: "Pinned resource", description: "Helpful reading", richTextContent: null, resourceId: "resource-1", resourceVersionId: "pinned-version", resourceCategory: "document" as const },
      { ...page("Video", 2, "Video"), blockType: "video_link" as const, title: "Video", url: "https://video.example/watch" },
    ];
    const { bytes } = await buildSessionMaterialsPdf("Session", blocks, "https://app.example");
    const pdf = bytes.toString("latin1");
    expect(pdf).toContain("/resource-library/resource-1/open?version=pinned-version");
    expect(pdf).toContain("https://video.example/watch");
    await expect(buildSessionMaterialsPdf("Session", [{ ...blocks[1], url: "javascript:alert(1)" }], "https://app.example")).rejects.toThrow("invalid");
  });

  it("embeds a supported pinned Resource image and links to its authorized version", async () => {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#50a684" } }).png().toBuffer();
    const block = { ...page("Image", 1, "Image"), blockType: "library_resource" as const, title: "Pinned image", richTextContent: null, resourceId: "resource-image", resourceVersionId: "image-version", resourceCategory: "image" as const, image, imageWidth: 2, imageHeight: 2 };
    const { bytes } = await buildSessionMaterialsPdf("Session", [block], "https://app.example");
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(bytes.toString("latin1")).toContain("/resource-library/resource-image/open?version=image-version");
  });

  it("fails safely on unsupported rich text nodes rather than silently omitting content", async () => {
    await expect(buildSessionMaterialsPdf("Session", [{ ...page("Bad", 1, "Unused"), richTextContent: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.test/image.png" } }] } }], "https://app.example")).rejects.toThrow("unsupported content");
  });
});
