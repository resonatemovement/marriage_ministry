import { describe, expect, it, vi } from "vitest";
import { finalizeResourceUpload, prepareResourceUpload, type ResourceUploadStore, type ResourceVersion, type ResourceUpload } from "./uploads";

const input = { title: "Original", category: "document" as const, mimeType: "application/pdf", sizeBytes: 1, originalFilename: "file.pdf" };
const upload: ResourceUpload = { id: "version", resource_id: "resource", storage_path: "resource/version/file.pdf", mime_type: input.mimeType, size_bytes: 1, original_filename: input.originalFilename, uploaded_by: "owner", created_at: "now", expires_at: "later" };
const version: ResourceVersion = { ...upload, version_number: 2 };
function store(): ResourceUploadStore {
  return { actor: { id: "owner", roles: ["author"] }, getResource: vi.fn(), reserve: vi.fn().mockResolvedValue(upload),
    sign: vi.fn().mockResolvedValue({ token: "scoped", signedUrl: "private", path: upload.storage_path }),
    cancel: vi.fn().mockResolvedValue(undefined), finalize: vi.fn().mockResolvedValue(version),
    maintain: vi.fn().mockResolvedValue({ pruned: 0, removed: 0, pending: 0, errors: [] }) };
}
describe("Resource upload orchestration", () => {
  it("validates before reserving and returns exact upload identity", async () => {
    const ports = store();
    const result = await prepareResourceUpload(ports, input);
    expect(result).toMatchObject({ resourceId: "resource", uploadId: "version", path: upload.storage_path, sizeBytes: 1, mimeType: input.mimeType });
    expect(ports.sign).toHaveBeenCalledWith(upload);
    expect(ports.finalize).not.toHaveBeenCalled();
  });
  it("denies invalid MIME before any persisted reservation", async () => {
    const ports = store();
    await expect(prepareResourceUpload(ports, { ...input, mimeType: "application/octet-stream" })).rejects.toThrow();
    expect(ports.reserve).not.toHaveBeenCalled();
  });
  it("denies unauthorized roles", async () => {
    const ports = store(); ports.actor.roles = ["coach"];
    await expect(prepareResourceUpload(ports, input)).rejects.toThrow("Not authorized");
    expect(ports.reserve).not.toHaveBeenCalled();
  });
  it("checks ownership/category before replacement reservation", async () => {
    const ports = store();
    vi.mocked(ports.getResource).mockResolvedValue({ created_by: "other", archived_at: null } as Awaited<ReturnType<typeof ports.getResource>>);
    await expect(prepareResourceUpload(ports, { ...input, resourceId: "resource" })).rejects.toThrow("Not authorized");
    vi.mocked(ports.getResource).mockResolvedValue({ created_by: "owner", archived_at: null, category: "image" } as Awaited<ReturnType<typeof ports.getResource>>);
    await expect(prepareResourceUpload(ports, { ...input, resourceId: "resource" })).rejects.toThrow("preserve Resource category");
    expect(ports.reserve).not.toHaveBeenCalled();
  });
  it("prepares a replacement against the stable resource, not a new logical identity", async () => {
    const ports = store();
    vi.mocked(ports.getResource).mockResolvedValue({ created_by: "owner", archived_at: null, category: "document" } as Awaited<ReturnType<typeof ports.getResource>>);
    await prepareResourceUpload(ports, { ...input, resourceId: "resource" });
    expect(ports.reserve).toHaveBeenCalledWith({ ...input, resourceId: "resource" });
  });
  it("cancels a reservation when signing fails", async () => {
    const ports = store(); vi.mocked(ports.sign).mockRejectedValue(new Error("Signing failed"));
    await expect(prepareResourceUpload(ports, input)).rejects.toThrow("Signing failed");
    expect(ports.cancel).toHaveBeenCalledWith(upload.id);
  });
  it("reports cancellation failure rather than hiding the orphan risk", async () => {
    const ports = store(); vi.mocked(ports.sign).mockRejectedValue(new Error("Signing failed"));
    vi.mocked(ports.cancel).mockRejectedValue(new Error("DB unavailable"));
    await expect(prepareResourceUpload(ports, input)).rejects.toThrow("cancellation also failed");
  });
  it("does not prune when finalization fails and requests race-safe cancellation", async () => {
    const ports = store(); vi.mocked(ports.finalize).mockRejectedValue(new Error("File missing"));
    await expect(finalizeResourceUpload(ports, upload.id)).rejects.toThrow("File missing");
    expect(ports.maintain).not.toHaveBeenCalled(); expect(ports.cancel).toHaveBeenCalledWith(upload.id);
  });
  it("prunes only after successful finalization", async () => {
    const ports = store();
    expect(await finalizeResourceUpload(ports, upload.id)).toMatchObject({ version, maintenance: { errors: [] } });
    expect(ports.finalize).toHaveBeenCalledWith(upload.id);
    expect(ports.maintain).toHaveBeenCalledWith(version.resource_id);
    expect(vi.mocked(ports.finalize).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(ports.maintain).mock.invocationCallOrder[0]);
  });
  it("reports cleanup failure without undoing a successful replacement", async () => {
    const ports = store(); vi.mocked(ports.maintain).mockRejectedValue(new Error("Storage unavailable"));
    const result = await finalizeResourceUpload(ports, upload.id);
    expect(result.version).toEqual(version); expect(result.maintenance.errors[0]).toContain("Storage unavailable");
    expect(ports.cancel).not.toHaveBeenCalled();
  });
});
