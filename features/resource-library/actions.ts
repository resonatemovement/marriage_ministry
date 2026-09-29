"use server";

import { revalidatePath } from "next/cache";
import { archiveResource, cancelUpload, editResourceMetadata, finalizeUpload, permanentlyDeleteResource, prepareUpload } from "./server";
import { loadResourceLibrary, loadResourceLibraryDetail } from "./library-data";
import type { UploadRequest } from "./uploads";
import type { ResourceMetadata } from "./policy";

type ActionResult<T> = { data: T } | { error: string };

async function action<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { data: await work() }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Resource Library request failed." }; }
}

export async function reloadResourceLibrary(archived = false) {
  return action(() => loadResourceLibrary(archived));
}

export async function loadResourceDetail(resourceId: string) {
  return action(() => loadResourceLibraryDetail(resourceId));
}

export async function reserveResourceUpload(input: UploadRequest) {
  return action(async () => {
    const prepared = await prepareUpload(input);
    return { uploadId: prepared.uploadId, resourceId: prepared.resourceId, token: prepared.token, path: prepared.path };
  });
}

export async function finishResourceUpload(uploadId: string) {
  return action(async () => {
    const result = await finalizeUpload(uploadId);
    revalidatePath("/resource-library");
    return result;
  });
}

export async function abandonResourceUpload(uploadId: string) {
  return action(() => cancelUpload(uploadId));
}

export async function saveResourceMetadata(resourceId: string, metadata: ResourceMetadata) {
  return action(async () => {
    const result = await editResourceMetadata(resourceId, metadata);
    revalidatePath("/resource-library");
    return result;
  });
}

export async function setResourceArchived(resourceId: string, archived: boolean) {
  return action(async () => {
    const result = await archiveResource(resourceId, archived);
    revalidatePath("/resource-library");
    return result;
  });
}

export async function removeResource(resourceId: string, confirmation: string) {
  return action(async () => {
    const result = await permanentlyDeleteResource(resourceId, confirmation);
    revalidatePath("/resource-library");
    return result;
  });
}
