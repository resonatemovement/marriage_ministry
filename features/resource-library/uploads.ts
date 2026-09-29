import type { Database } from "@/types/database.generated";
import {
  canBrowseResources, canManageResource, validateResourceFile, validateResourceMetadata,
  type ResourceActor, type ResourceCategory, type ResourceFile, type ResourceMetadata,
} from "./policy";

export type Resource = Database["public"]["Tables"]["resources"]["Row"];
export type ResourceUpload = Database["public"]["Tables"]["resource_uploads"]["Row"];
export type ResourceVersion = Database["public"]["Tables"]["resource_versions"]["Row"];
export type UploadRequest = ResourceFile & ResourceMetadata & { resourceId?: string };
export type MaintenanceResult = { pruned: number; removed: number; pending: number; errors: string[] };

export interface ResourceUploadStore {
  actor: ResourceActor;
  getResource(id: string): Promise<Resource>;
  reserve(input: UploadRequest): Promise<ResourceUpload>;
  sign(upload: ResourceUpload): Promise<{ token: string; signedUrl: string; path: string }>;
  cancel(id: string): Promise<void>;
  finalize(id: string): Promise<ResourceVersion>;
  maintain(resourceId: string): Promise<MaintenanceResult>;
}

export async function prepareResourceUpload(store: ResourceUploadStore, input: UploadRequest) {
  if (!canBrowseResources(store.actor)) throw new Error("Not authorized");
  validateResourceFile(input);
  if (input.resourceId) {
    const resource = await store.getResource(input.resourceId);
    if (!canManageResource(store.actor, resource)) throw new Error("Not authorized");
    if (resource.category !== input.category) throw new Error("Replacement must preserve Resource category");
  } else {
    validateResourceMetadata(input);
  }
  const upload = await store.reserve(input);
  try {
    const authorization = await store.sign(upload);
    return { uploadId: upload.id, resourceId: upload.resource_id, mimeType: upload.mime_type,
      sizeBytes: upload.size_bytes, ...authorization };
  } catch (error) {
    await cancelFailedUpload(store, upload.id, error);
    throw error;
  }
}

async function cancelFailedUpload(store: ResourceUploadStore, id: string, failure: unknown) {
  try { await store.cancel(id); }
  catch (cleanupError) {
    throw new AggregateError([failure, cleanupError], "Upload failed; cancellation also failed. Retry cancellation or maintenance.");
  }
}

export async function finalizeResourceUpload(store: ResourceUploadStore, uploadId: string) {
  let version: ResourceVersion;
  try { version = await store.finalize(uploadId); }
  catch (error) {
    // DB cancellation is race-safe: if finalization committed but its response was lost,
    // it cannot enqueue a finalized version. A retry can resolve that committed version.
    await cancelFailedUpload(store, uploadId, error);
    throw error;
  }
  let maintenance: MaintenanceResult;
  try { maintenance = await store.maintain(version.resource_id); }
  catch (error) {
    maintenance = { pruned: 0, removed: 0, pending: 0, errors: [String(error)] };
  }
  return { version, maintenance }; // Cleanup failure is visible, never a failed replacement.
}

export type UploadActionResult<T> = { data: T } | { error: string };
export type PreparedBrowserUpload = { uploadId: string; resourceId: string; token: string; path: string };
export type FinalizedBrowserUpload = { version: ResourceVersion; maintenance: MaintenanceResult };
export type BrowserUploadFile = Blob & { name: string; size: number; type: string };

export interface BrowserUploadOperations {
  prepare(input: UploadRequest): Promise<UploadActionResult<PreparedBrowserUpload>>;
  upload(path: string, token: string, file: BrowserUploadFile): Promise<{ error: string | null }>;
  finalize(uploadId: string): Promise<UploadActionResult<FinalizedBrowserUpload>>;
  cancel(uploadId: string): Promise<UploadActionResult<void>>;
}

export async function uploadResourceFileDirect(
  operations: BrowserUploadOperations,
  file: BrowserUploadFile,
  metadata: ResourceMetadata,
  category: ResourceCategory,
  resourceId?: string,
  onStage: (stage: "preparing" | "uploading" | "finalizing") => void = () => {},
) {
  validateResourceFile({ category, mimeType: file.type, sizeBytes: file.size, originalFilename: file.name });
  if (!resourceId) validateResourceMetadata(metadata);

  onStage("preparing");
  const reserved = await operations.prepare({ ...metadata, category, mimeType: file.type, sizeBytes: file.size, originalFilename: file.name, resourceId });
  if ("error" in reserved) throw new Error(reserved.error);

  onStage("uploading");
  const uploaded = await operations.upload(reserved.data.path, reserved.data.token, file);
  if (uploaded.error) {
    const cancelled = await operations.cancel(reserved.data.uploadId);
    if ("error" in cancelled) throw new AggregateError([new Error(uploaded.error), new Error(cancelled.error)], "Upload failed and its reservation could not be cancelled.");
    throw new Error(uploaded.error);
  }

  onStage("finalizing");
  const finalized = await operations.finalize(reserved.data.uploadId);
  if ("error" in finalized) throw new Error(finalized.error);
  if (finalized.data.version.resource_id !== reserved.data.resourceId) {
    throw new Error("The uploaded file was finalized under an unexpected Resource.");
  }
  return finalized.data;
}
