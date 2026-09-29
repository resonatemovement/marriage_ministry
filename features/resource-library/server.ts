import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { hasAdministrativeAccess } from "@/lib/counseling/domain";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";
import { canBrowseResources, RESOURCE_POLICY, sanitizeResourceFilename, validateResourceMetadata, type ResourceCategory, type ResourceMetadata } from "./policy";
import { finalizeResourceUpload, prepareResourceUpload, type MaintenanceResult, type ResourceUploadStore, type UploadRequest } from "./uploads";

function storageService() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing server-only Supabase secret");
  return createClient<Database>(getSupabaseEnvironment().url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function unwrap<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("Resource unavailable");
  return result.data;
}

async function context() {
  const client = await createServerSupabaseClient();
  const identity = await getAuthenticatedIdentity();
  if (!identity || identity.accountStage !== "active") throw new Error("Not authorized");
  const actor = { id: identity.id, roles: identity.roles };
  if (!canBrowseResources(actor)) throw new Error("Not authorized");
  return { client, actor };
}

export async function currentResourceActor() {
  return (await context()).actor;
}

async function removeQueuedFiles(service: SupabaseClient<Database>, resourceId?: string) {
  let query = service.from("resource_storage_cleanup").select("*").lte("not_before", new Date().toISOString()).order("created_at").limit(100);
  if (resourceId) query = query.eq("resource_id", resourceId);
  const queued = unwrap(await query);
  let removed = 0;
  const errors: string[] = [];
  for (const item of queued) {
    const { error } = await service.storage.from(RESOURCE_POLICY.bucket).remove([item.storage_path]);
    if (error) {
      errors.push(error.message);
      const saved = await service.from("resource_storage_cleanup").update({ attempts: item.attempts + 1, last_error: error.message }).eq("storage_path", item.storage_path);
      if (saved.error) errors.push(saved.error.message);
      continue;
    }
    const completed = await service.from("resource_storage_cleanup").delete().eq("storage_path", item.storage_path);
    if (completed.error) errors.push(completed.error.message);
    else removed++;
  }
  // Count all queued objects, not merely the bounded batch (includes delayed cancellations).
  let count = service.from("resource_storage_cleanup").select("storage_path", { count: "exact", head: true });
  if (resourceId) count = count.eq("resource_id", resourceId);
  const remaining = await count;
  if (remaining.error) errors.push(remaining.error.message);
  return { removed, pending: remaining.count ?? 0, errors };
}

async function uploadStore(): Promise<ResourceUploadStore> {
  const { client, actor } = await context();
  return {
    actor,
    getResource: async (id) => unwrap(await client.from("resources").select("*").eq("id", id).single()),
    reserve: async (input) => {
      // The generator cannot express SQL's nullable UUID argument. Keep its sole
      // nullability accommodation here; no generated types are manually changed.
      const args = {
        target_resource_id: input.resourceId ?? null, target_title: input.title,
        target_description: input.description ?? "", target_category: input.category,
        target_mime_type: input.mimeType, target_size_bytes: input.sizeBytes,
        target_original_filename: input.originalFilename, target_safe_filename: sanitizeResourceFilename(input.originalFilename),
      } as unknown as Database["public"]["Functions"]["prepare_resource_upload"]["Args"];
      return unwrap(await client.rpc("prepare_resource_upload", args));
    },
    sign: async (upload) => {
      // Reservations are 3h; sign immediately so every token has expired before orphan removal.
      if (Date.now() - Date.parse(upload.created_at) > 60_000) throw new Error("Upload reservation signing window expired");
      return unwrap(await storageService().storage.from(RESOURCE_POLICY.bucket).createSignedUploadUrl(upload.storage_path, { upsert: false }));
    },
    cancel: async (id) => {
      const { error } = await client.rpc("cancel_resource_upload", { target_upload_id: id });
      if (error) throw new Error(error.message);
    },
    finalize: async (id) => unwrap(await client.rpc("finalize_resource_upload", { target_upload_id: id })),
    maintain: async (id): Promise<MaintenanceResult> => {
      const service = storageService();
      const pruned = unwrap(await service.rpc("prune_resource_versions", { target_resource_id: id, keep_previous: RESOURCE_POLICY.previousVersions }));
      return { pruned, ...await removeQueuedFiles(service, id) };
    },
  };
}

// Server operations accept only metadata/identities; binaries go browser -> Storage.
export async function prepareUpload(input: UploadRequest) {
  return prepareResourceUpload(await uploadStore(), input);
}
export async function finalizeUpload(uploadId: string) {
  return finalizeResourceUpload(await uploadStore(), uploadId);
}
export async function cancelUpload(uploadId: string) {
  await (await uploadStore()).cancel(uploadId);
}

export async function browseResources(options: { category?: ResourceCategory; archived?: boolean; search?: string; offset?: number } = {}) {
  const { client } = await context();
  const offset = options.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid browse offset");
  if (options.category && !(options.category in RESOURCE_POLICY.categories)) throw new Error("Invalid category");
  let query = client.from("resources").select("*, resource_versions!resources_current_version_fk(*)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range(offset, offset + 49);
  query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (options.category) query = query.eq("category", options.category);
  if (options.search?.trim()) query = query.ilike("title", `%${options.search.trim().replace(/[\\%_]/g, "\\$&")}%`);
  const result = await query;
  return { resources: unwrap(result), count: result.count ?? 0 };
}

export async function getResourceDetail(resourceId: string) {
  const { client } = await context();
  const resource = unwrap(await client.from("resources").select("*").eq("id", resourceId).single());
  const versions = unwrap(await client.from("resource_versions").select("*").eq("resource_id", resourceId).order("version_number", { ascending: false }));
  return { resource, versions };
}

export async function editResourceMetadata(resourceId: string, metadata: ResourceMetadata) {
  const { client } = await context();
  const valid = validateResourceMetadata(metadata);
  return unwrap(await client.rpc("update_resource_metadata", { target_resource_id: resourceId, target_title: valid.title, target_description: valid.description ?? "" }));
}

export async function signedResourceAccess(resourceId: string, options: { versionId?: string; download?: boolean } = {}) {
  const { client } = await context();
  const resource = unwrap(await client.from("resources").select("current_version_id").eq("id", resourceId).single());
  const versionId = options.versionId ?? resource.current_version_id;
  if (!versionId) throw new Error("Resource unavailable");
  const version = unwrap(await client.from("resource_versions").select("*").eq("resource_id", resourceId).eq("id", versionId).single());
  return unwrap(await client.storage.from(RESOURCE_POLICY.bucket).createSignedUrl(version.storage_path, RESOURCE_POLICY.accessSeconds,
    options.download ? { download: sanitizeResourceFilename(version.original_filename) } : undefined));
}

export async function signedResourcePreviews(resourceIds: readonly string[]) {
  if (!resourceIds.length) return {} as Record<string, string>;
  const { client } = await context();
  const rows = unwrap(await client.from("resources")
    .select("id, resource_versions!resources_current_version_fk(storage_path)")
    .in("id", [...new Set(resourceIds)]));
  const paths = rows.flatMap((row) => {
    const version = Array.isArray(row.resource_versions) ? row.resource_versions[0] : row.resource_versions;
    return version?.storage_path ? [{ id: row.id, path: version.storage_path }] : [];
  });
  if (!paths.length) return {} as Record<string, string>;
  const signed = await client.storage.from(RESOURCE_POLICY.bucket)
    .createSignedUrls(paths.map((item) => item.path), RESOURCE_POLICY.accessSeconds);
  if (signed.error) throw new Error(signed.error.message);
  return Object.fromEntries(paths.flatMap((item, index) => {
    const url = signed.data[index]?.signedUrl;
    return url ? [[item.id, url]] : [];
  }));
}

export async function archiveResource(resourceId: string, archived: boolean) {
  const { client, actor } = await context();
  if (!hasAdministrativeAccess(actor.roles)) throw new Error("Not authorized");
  return unwrap(await client.rpc("set_resource_archived", { target_resource_id: resourceId, should_archive: archived }));
}

export async function permanentlyDeleteResource(resourceId: string, confirmation: string) {
  const { client, actor } = await context();
  if (!hasAdministrativeAccess(actor.roles) || confirmation !== "DELETE") throw new Error("Not authorized or missing DELETE confirmation");
  const { error } = await client.rpc("delete_resource", { target_resource_id: resourceId });
  if (error) throw new Error(error.message); // Never touch Storage if DB rejects deletion.
  try { return await removeQueuedFiles(storageService(), resourceId); }
  catch (cleanupError) { return { removed: 0, pending: 0, errors: [String(cleanupError)] }; }
}

// Explicit admin retry; no scheduler/job or speculative infrastructure in this milestone.
export async function retryResourceCleanup() {
  const { actor } = await context();
  if (!hasAdministrativeAccess(actor.roles)) throw new Error("Not authorized");
  const service = storageService();
  const expired = unwrap(await service.rpc("expire_resource_uploads"));
  return { expired, ...await removeQueuedFiles(service) };
}
