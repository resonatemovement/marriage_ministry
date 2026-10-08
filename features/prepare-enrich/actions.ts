"use server";

import { revalidatePath } from "next/cache";

import { finalizePrepareEnrichUpload, preparePrepareEnrichUpload, type PrepareEnrichSlot } from "./server";

type Result<T> = { data: T } | { error: string };
async function action<T>(work: () => Promise<T>): Promise<Result<T>> {
  try { return { data: await work() }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Prepare & Enrich request failed." }; }
}

export async function reservePrepareEnrichUpload(input: { counselingCaseId: string; slot: PrepareEnrichSlot; mimeType: string; sizeBytes: number; originalFilename: string }) {
  return action(() => preparePrepareEnrichUpload(input));
}

export async function finishPrepareEnrichUpload(input: { counselingCaseId: string; slot: PrepareEnrichSlot; path: string; fileName: string; mimeType: string; sizeBytes: number; coupleGroupId: string }) {
  return action(async () => {
    const document = await finalizePrepareEnrichUpload(input);
    revalidatePath(`/people/${input.coupleGroupId}`);
    revalidatePath(`/workspace/cases/${input.counselingCaseId}`);
    return document;
  });
}
