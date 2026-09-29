import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { canManageResource, type ResourceCategory } from "./policy";
import { browseResources, currentResourceActor, getResourceDetail, signedResourceAccess, signedResourcePreviews } from "./server";
import type { ResourceLibraryItem } from "./presentation";

type CurrentVersion = {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  storage_path: string;
};

type ResourceWithVersion = {
  id: string;
  title: string;
  description: string | null;
  category: ResourceCategory;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  current_version_id: string;
  resource_versions: CurrentVersion | CurrentVersion[] | null;
};

export async function loadResourceLibrary(archived = false) {
  const [result, actor] = await Promise.all([browseResources({ archived }), currentResourceActor()]);
  const rows = result.resources as unknown as ResourceWithVersion[];
  const previews = await signedResourcePreviews(rows.filter((row) => row.category === "image").map((row) => row.id));
  const resources: ResourceLibraryItem[] = rows.flatMap((row) => {
    const current = Array.isArray(row.resource_versions) ? row.resource_versions[0] : row.resource_versions;
    if (!current || current.id !== row.current_version_id) return [];
    return [{
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      canManage: canManageResource(actor, row),
      currentVersion: {
        originalFilename: current.original_filename,
        mimeType: current.mime_type,
        sizeBytes: current.size_bytes,
        uploadedAt: current.created_at,
      },
      previewUrl: previews[row.id] ?? null,
    }];
  });
  return { resources, count: result.count };
}

export async function loadResourceLibraryDetail(resourceId: string) {
  const [{ resource, versions }, previewUrl, identity, client] = await Promise.all([
    getResourceDetail(resourceId),
    signedResourceAccess(resourceId),
    getAuthenticatedIdentity(),
    createServerSupabaseClient(),
  ]);
  const current = versions.find((version) => version.id === resource.current_version_id);
  if (!current) throw new Error("Resource unavailable");
  const { data: uploader } = await client.from("profiles").select("first_name,last_name").eq("id", current.uploaded_by).maybeSingle();
  const uploaderName = [uploader?.first_name, uploader?.last_name].filter(Boolean).join(" ")
    || (current.uploaded_by === resource.created_by ? "Resource owner" : "Ministry team member");
  return {
    title: resource.title,
    description: resource.description,
    category: resource.category,
    archivedAt: resource.archived_at,
    createdAt: resource.created_at,
    updatedAt: resource.updated_at,
    canManage: identity ? canManageResource({ id: identity.id, roles: identity.roles }, resource) : false,
    currentVersion: {
      originalFilename: current.original_filename,
      mimeType: current.mime_type,
      sizeBytes: current.size_bytes,
      uploadedAt: current.created_at,
      uploaderName,
    },
    previewUrl: previewUrl.signedUrl,
  };
}
