import { describe, expect, it, vi } from "vitest";
import { uploadResourceFileDirect, type BrowserUploadOperations, type BrowserUploadFile } from "./uploads";

function setup() {
  const calls: string[] = [];
  const operations: BrowserUploadOperations = {
    prepare: vi.fn(async () => { calls.push("prepare"); return { data: { uploadId: "upload", resourceId: "resource", path: "resource/version/file.pdf", token: "scoped" } }; }),
    upload: vi.fn(async () => { calls.push("upload"); return { error: null }; }),
    finalize: vi.fn(async () => { calls.push("finalize"); return { data: { version: { resource_id: "resource" } as never, maintenance: { pruned: 0, removed: 0, pending: 0, errors: [] } } }; }),
    cancel: vi.fn(async () => { calls.push("cancel"); return { data: undefined }; }),
  };
  const file = { name: "guide.pdf", type: "application/pdf", size: 9 } as BrowserUploadFile;
  return { operations, calls, file };
}

describe("direct Resource upload orchestration", () => {
  it("runs prepare, browser Storage upload, then finalize with truthful stage updates", async () => {
    const { operations, calls, file } = setup();
    const stages: string[] = [];
    await uploadResourceFileDirect(operations, file, { title: "Guide" }, "document", undefined, (stage) => stages.push(stage));
    expect(calls).toEqual(["prepare", "upload", "finalize"]);
    expect(stages).toEqual(["preparing", "uploading", "finalizing"]);
    expect(operations.prepare).toHaveBeenCalledWith(expect.objectContaining({ title: "Guide", mimeType: "application/pdf", originalFilename: "guide.pdf" }));
    expect(operations.upload).toHaveBeenCalledWith("resource/version/file.pdf", "scoped", file);
  });

  it("rejects unsupported MIME and oversized files before reserving", async () => {
    const { operations, file } = setup();
    await expect(uploadResourceFileDirect(operations, { ...file, type: "application/octet-stream" }, { title: "File" }, "document")).rejects.toThrow("Unsupported");
    await expect(uploadResourceFileDirect(operations, { ...file, size: 25 * 1024 * 1024 + 1 }, { title: "File" }, "document")).rejects.toThrow("size limit");
    expect(operations.prepare).not.toHaveBeenCalled();
  });

  it("shows a controlled account lookup failure before any Storage transfer", async () => {
    const { operations, file } = setup();
    vi.mocked(operations.prepare).mockResolvedValue({ error: "Your account roles could not be loaded. Please try again." });
    await expect(uploadResourceFileDirect(operations, file, { title: "Guide" }, "document"))
      .rejects.toThrow("Your account roles could not be loaded. Please try again.");
    expect(operations.upload).not.toHaveBeenCalled();
  });

  it("cancels a failed Storage upload and never finalizes it", async () => {
    const { operations, calls, file } = setup();
    vi.mocked(operations.upload).mockImplementation(async () => { calls.push("upload"); return { error: "Storage rejected the file" }; });
    await expect(uploadResourceFileDirect(operations, file, { title: "Guide" }, "document")).rejects.toThrow("Storage rejected");
    expect(calls).toEqual(["prepare", "upload", "cancel"]);
    expect(operations.finalize).not.toHaveBeenCalled();
  });

  it("does not claim success when finalization fails", async () => {
    const { operations, file } = setup();
    vi.mocked(operations.finalize).mockResolvedValue({ error: "File missing" });
    await expect(uploadResourceFileDirect(operations, file, { title: "Guide" }, "document")).rejects.toThrow("File missing");
  });

  it("keeps replacement bound to the existing Resource and rejects a mismatched category", async () => {
    const { operations, file } = setup();
    await uploadResourceFileDirect(operations, file, { title: "Existing" }, "document", "resource");
    expect(operations.prepare).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "resource" }));
    await expect(uploadResourceFileDirect(operations, file, { title: "Existing" }, "image", "resource")).rejects.toThrow("Unsupported");
  });
});
