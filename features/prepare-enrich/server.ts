import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { hasAdministrativeAccess } from "@/lib/counseling/domain";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeResourceFilename, validateResourceFile } from "@/features/resource-library/policy";
import type { Database } from "@/types/database.generated";
import { isPrepareEnrichSlot, PREPARE_ENRICH_BUCKET, type PrepareEnrichDocument, type PrepareEnrichSlot } from "./model";

type UploadInput = { counselingCaseId: string; slot: PrepareEnrichSlot; mimeType: string; sizeBytes: number; originalFilename: string };

export { PREPARE_ENRICH_BUCKET, PREPARE_ENRICH_SLOTS, type PrepareEnrichDocument, type PrepareEnrichSlot } from "./model";

function storageService() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Missing server-only Supabase secret");
  return createClient<Database>(getSupabaseEnvironment().url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function adminContext() {
  const identity = await getAuthenticatedIdentity();
  if (!identity || identity.accountStage !== "active" || !hasAdministrativeAccess(identity.roles)) throw new Error("Not authorized");
  return { identity, client: await createServerSupabaseClient() };
}

function documentRow(row: { id: string; document_slot: string; file_name: string; content_type: string; size_bytes: number }): PrepareEnrichDocument | null {
  return isPrepareEnrichSlot(row.document_slot) ? { id: row.id, slot: row.document_slot, fileName: row.file_name, contentType: row.content_type, sizeBytes: row.size_bytes } : null;
}

export async function getAdminPrepareEnrichDocuments(coupleGroupId: string) {
  const { client } = await adminContext();
  const { data: counselingCase, error: caseError } = await client.from("counseling_cases").select("id").eq("couple_group_id", coupleGroupId).maybeSingle();
  if (caseError) throw new Error("Prepare & Enrich documents are unavailable");
  if (!counselingCase) return { counselingCaseId: null, documents: [] as PrepareEnrichDocument[] };
  const { data, error } = await client.from("assessment_documents").select("id,document_slot,file_name,content_type,size_bytes").eq("counseling_case_id", counselingCase.id);
  if (error) throw new Error("Prepare & Enrich documents are unavailable");
  return { counselingCaseId: counselingCase.id, documents: (data ?? []).flatMap((row) => { const document = documentRow(row); return document ? [document] : []; }) };
}

export async function getCounselorPrepareEnrichDocument(counselingCaseId: string): Promise<PrepareEnrichDocument | null> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assessment_documents").select("id,document_slot,file_name,content_type,size_bytes").eq("counseling_case_id", counselingCaseId).eq("document_slot", "counselor").maybeSingle();
  if (error) throw new Error("Prepare & Enrich document is unavailable");
  return data ? documentRow(data) : null;
}

async function currentCoupleCaseId() {
  const client = await createServerSupabaseClient();
  const result = await client.rpc("get_current_couple_case_team");
  if (result.error || !result.data?.[0]) return null;
  return result.data[0].counseling_case_id;
}

export async function getCouplePrepareEnrichDocument(): Promise<PrepareEnrichDocument | null> {
  const counselingCaseId = await currentCoupleCaseId();
  if (!counselingCaseId) return null;
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assessment_documents").select("id,document_slot,file_name,content_type,size_bytes").eq("counseling_case_id", counselingCaseId).eq("document_slot", "couple").maybeSingle();
  if (error) throw new Error("Prepare & Enrich document is unavailable");
  return data ? documentRow(data) : null;
}

export async function preparePrepareEnrichUpload(input: UploadInput) {
  const { identity, client } = await adminContext();
  if (!isPrepareEnrichSlot(input.slot)) throw new Error("Invalid document slot");
  validateResourceFile({ category: "document", mimeType: input.mimeType, sizeBytes: input.sizeBytes, originalFilename: input.originalFilename });
  const { data: counselingCase, error: caseError } = await client.from("counseling_cases").select("id").eq("id", input.counselingCaseId).maybeSingle();
  if (caseError || !counselingCase) throw new Error("Counseling case is unavailable");
  const path = `${input.counselingCaseId}/${input.slot}/${crypto.randomUUID()}-${sanitizeResourceFilename(input.originalFilename)}`;
  const { data, error } = await storageService().storage.from(PREPARE_ENRICH_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error("Document upload could not be prepared");
  return { path: data.path, token: data.token, counselingCaseId: input.counselingCaseId, slot: input.slot, fileName: input.originalFilename, mimeType: input.mimeType, sizeBytes: input.sizeBytes, uploadedBy: identity.id };
}

export async function finalizePrepareEnrichUpload(input: { counselingCaseId: string; slot: PrepareEnrichSlot; path: string; fileName: string; mimeType: string; sizeBytes: number }) {
  const { identity, client } = await adminContext();
  if (!isPrepareEnrichSlot(input.slot) || !input.path.startsWith(`${input.counselingCaseId}/${input.slot}/`)) throw new Error("Invalid document upload");
  validateResourceFile({ category: "document", mimeType: input.mimeType, sizeBytes: input.sizeBytes, originalFilename: input.fileName });
  const { data: previous, error: previousError } = await client.from("assessment_documents").select("object_path").eq("counseling_case_id", input.counselingCaseId).eq("document_slot", input.slot).maybeSingle();
  if (previousError) throw new Error("Document replacement is unavailable");
  const { data, error } = await client.from("assessment_documents").upsert({ counseling_case_id: input.counselingCaseId, document_slot: input.slot, object_path: input.path, file_name: input.fileName, content_type: input.mimeType, size_bytes: input.sizeBytes, uploaded_by: identity.id }, { onConflict: "counseling_case_id,document_slot" }).select("id,document_slot,file_name,content_type,size_bytes").single();
  if (error) throw new Error("Document replacement could not be saved");
  if (previous?.object_path && previous.object_path !== input.path) await storageService().storage.from(PREPARE_ENRICH_BUCKET).remove([previous.object_path]);
  const document = documentRow(data); if (!document) throw new Error("Document replacement could not be saved");
  return document;
}

export async function signedAdminPrepareEnrichAccess(coupleGroupId: string, slot: string) {
  if (!isPrepareEnrichSlot(slot)) throw new Error("Document unavailable");
  const { counselingCaseId } = await getAdminPrepareEnrichDocuments(coupleGroupId);
  if (!counselingCaseId) throw new Error("Document unavailable");
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assessment_documents").select("object_path,file_name").eq("counseling_case_id", counselingCaseId).eq("document_slot", slot).maybeSingle();
  if (error || !data) throw new Error("Document unavailable");
  const signed = await client.storage.from(PREPARE_ENRICH_BUCKET).createSignedUrl(data.object_path, 300, { download: sanitizeResourceFilename(data.file_name) });
  if (signed.error || !signed.data) throw new Error("Document unavailable");
  return signed.data;
}

export async function signedCounselorPrepareEnrichAccess(counselingCaseId: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assessment_documents").select("object_path,file_name").eq("counseling_case_id", counselingCaseId).eq("document_slot", "counselor").maybeSingle();
  if (error || !data) throw new Error("Document unavailable");
  const signed = await client.storage.from(PREPARE_ENRICH_BUCKET).createSignedUrl(data.object_path, 300, { download: sanitizeResourceFilename(data.file_name) });
  if (signed.error || !signed.data) throw new Error("Document unavailable");
  return signed.data;
}

export async function signedCouplePrepareEnrichAccess() {
  const counselingCaseId = await currentCoupleCaseId();
  if (!counselingCaseId) throw new Error("Document unavailable");
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assessment_documents").select("object_path,file_name").eq("counseling_case_id", counselingCaseId).eq("document_slot", "couple").maybeSingle();
  if (error || !data) throw new Error("Document unavailable");
  const signed = await client.storage.from(PREPARE_ENRICH_BUCKET).createSignedUrl(data.object_path, 300, { download: sanitizeResourceFilename(data.file_name) });
  if (signed.error || !signed.data) throw new Error("Document unavailable");
  return signed.data;
}
