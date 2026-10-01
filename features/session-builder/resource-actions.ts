"use server";

import { browseResources, signedResourceAccess, signedResourcePreviews } from "@/features/resource-library/server";
import { filterResourceItems, type ResourceLibraryItem } from "@/features/resource-library/presentation";
import { RESOURCE_POLICY, type ResourceCategory } from "@/features/resource-library/policy";

export async function findSessionResources(category: ResourceCategory) {
  if (!(category in RESOURCE_POLICY.categories)) throw new Error("Invalid Resource category");
  const rows = [] as Awaited<ReturnType<typeof browseResources>>["resources"];
  for (let offset = 0; ; offset += 50) {
    const result = await browseResources({ category, offset });
    rows.push(...result.resources);
    if (offset + result.resources.length >= result.count || !result.resources.length) break;
  }
  const resources: ResourceLibraryItem[] = rows.flatMap((row) => {
    const version = Array.isArray(row.resource_versions) ? row.resource_versions[0] : row.resource_versions;
    if (!version || version.id !== row.current_version_id) return [];
    return [{ id: row.id, title: row.title, description: row.description, category: row.category as ResourceCategory,
      archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at, canManage: false,
      currentVersion: { originalFilename: version.original_filename, mimeType: version.mime_type, sizeBytes: version.size_bytes, uploadedAt: version.created_at }, previewUrl: null }];
  }).filter((resource) => !resource.archivedAt);
  const previews: Record<string, string> = {};
  if (category === "image") {
    const imageIds = resources.map((resource) => resource.id);
    const previewBatches = Array.from({ length: Math.ceil(imageIds.length / 100) }, (_, batch) =>
      signedResourcePreviews(imageIds.slice(batch * 100, batch * 100 + 100)));
    Object.assign(previews, ...await Promise.all(previewBatches));
  }
  return filterResourceItems(resources.map((resource) => ({ ...resource, previewUrl: previews[resource.id] ?? null })), category, "");
}

export async function refreshSessionResourceAccess(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length > 100) throw new Error("Too many Resources");
  return Object.fromEntries(await Promise.all(unique.map(async (id) => [id, (await signedResourceAccess(id)).signedUrl] as const)));
}
