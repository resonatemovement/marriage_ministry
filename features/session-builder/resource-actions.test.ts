import { beforeEach, describe, expect, it, vi } from "vitest";

const { browseResources, signedResourcePreviews } = vi.hoisted(() => ({ browseResources: vi.fn(), signedResourcePreviews: vi.fn() }));
vi.mock("@/features/resource-library/server", () => ({ browseResources, signedResourceAccess: vi.fn(), signedResourcePreviews }));

import { findSessionResources } from "./resource-actions";

describe("Session Resource picker data", () => {
  beforeEach(() => { browseResources.mockReset(); signedResourcePreviews.mockReset().mockResolvedValue({}); });

  it.each(["image", "document", "audio", "video"] as const)("requests active %s Resources through Library authorization", async (category) => {
    browseResources.mockResolvedValue({ count: 1, resources: [{ id: "resource-id", title: "Canonical", description: "Description", category,
      archived_at: null, created_at: "", updated_at: "", current_version_id: "version-id",
      resource_versions: { id: "version-id", original_filename: "file", mime_type: "application/octet-stream", size_bytes: 10, created_at: "" } }] });
    const resources = await findSessionResources(category);
    expect(browseResources).toHaveBeenCalledWith({ category, offset: 0 });
    expect(resources).toMatchObject([{ id: "resource-id", category, title: "Canonical", canManage: false }]);
    if (category === "image") expect(signedResourcePreviews).toHaveBeenCalledWith(["resource-id"]);
    else expect(signedResourcePreviews).not.toHaveBeenCalled();
  });

  it("uses signed image thumbnails and excludes archived rows", async () => {
    browseResources.mockResolvedValue({ count: 2, resources: [
      { id: "active", title: "Active", description: null, category: "image", archived_at: null, created_at: "", updated_at: "", current_version_id: "v1",
        resource_versions: { id: "v1", original_filename: "active.png", mime_type: "image/png", size_bytes: 10, created_at: "" } },
      { id: "archived", title: "Archived", description: null, category: "image", archived_at: "2026-01-01", created_at: "", updated_at: "", current_version_id: "v2",
        resource_versions: { id: "v2", original_filename: "archived.png", mime_type: "image/png", size_bytes: 10, created_at: "" } },
    ] });
    signedResourcePreviews.mockResolvedValue({ active: "https://signed.example/preview" });
    await expect(findSessionResources("image")).resolves.toMatchObject([{ id: "active", previewUrl: "https://signed.example/preview" }]);
    expect(signedResourcePreviews).toHaveBeenCalledWith(["active"]);
  });

  it("pages through active Library results without offering a Session-specific upload", async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ id: String(index), title: `Image ${index}`, description: null, category: "image",
      archived_at: null, created_at: "", updated_at: "", current_version_id: "v",
      resource_versions: { id: "v", original_filename: "file.png", mime_type: "image/png", size_bytes: 10, created_at: "" } }));
    browseResources.mockResolvedValueOnce({ count: 51, resources: rows }).mockResolvedValueOnce({ count: 51, resources: [rows[0]] });
    expect(await findSessionResources("image")).toHaveLength(51);
    expect(browseResources).toHaveBeenLastCalledWith({ category: "image", offset: 50 });
  });
});
