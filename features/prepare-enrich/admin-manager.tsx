"use client";

import { useRef, useState } from "react";
import { FileText, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { RESOURCE_POLICY, formatResourceFileSize, validateResourceFile } from "@/features/resource-library/policy";

import { finishPrepareEnrichUpload, reservePrepareEnrichUpload } from "./actions";
import { PREPARE_ENRICH_BUCKET, type PrepareEnrichDocument, type PrepareEnrichSlot } from "./model";

const labels: Record<PrepareEnrichSlot, string> = { counselor: "Counselor Version", couple: "Couple Version" };
const accept = RESOURCE_POLICY.categories.document.mimeTypes.join(",");

function DocumentSlot({ coupleGroupId, counselingCaseId, slot, document }: { coupleGroupId: string; counselingCaseId: string; slot: PrepareEnrichSlot; document: PrepareEnrichDocument | null }) {
  const router = useRouter(); const inputRef = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function select(file: File | null) {
    if (!file) return; setError(null);
    try {
      validateResourceFile({ category: "document", mimeType: file.type, sizeBytes: file.size, originalFilename: file.name });
      setBusy(true);
      const prepared = await reservePrepareEnrichUpload({ counselingCaseId, slot, mimeType: file.type, sizeBytes: file.size, originalFilename: file.name });
      if ("error" in prepared) throw new Error(prepared.error);
      const { error: uploadError } = await createBrowserSupabaseClient().storage.from(PREPARE_ENRICH_BUCKET).uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const finished = await finishPrepareEnrichUpload({ counselingCaseId, slot, path: prepared.data.path, fileName: file.name, mimeType: file.type, sizeBytes: file.size, coupleGroupId });
      if ("error" in finished) throw new Error(finished.error);
      router.refresh();
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Document upload failed."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }
  return <div className="border-t border-border pt-4 first:border-t-0 first:pt-0"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-text-primary">{labels[slot]}</p>{document ? <p className="mt-1 flex items-center gap-1.5 break-all text-sm text-text-muted"><FileText className="size-4 shrink-0" aria-hidden="true" />{document.fileName} · {formatResourceFileSize(document.sizeBytes)}</p> : <p className="mt-1 text-sm text-text-muted">No document uploaded.</p>}</div><div><input ref={inputRef} type="file" accept={accept} className="sr-only" id={`prepare-enrich-${slot}`} disabled={busy} onChange={(event) => void select(event.currentTarget.files?.[0] ?? null)} /><label htmlFor={`prepare-enrich-${slot}`} aria-disabled={busy} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90 ${busy ? "pointer-events-none opacity-60" : ""}`}><FileUp className="size-4" aria-hidden="true" />{busy ? "Uploading…" : document ? "Replace" : "Upload"}</label></div></div>{error ? <p role="alert" className="mt-2 text-sm text-danger-strong">{error}</p> : null}</div>;
}

export function PrepareEnrichAdminManager({ coupleGroupId, counselingCaseId, documents }: { coupleGroupId: string; counselingCaseId: string | null; documents: PrepareEnrichDocument[] }) {
  if (!counselingCaseId) return <Card className="p-5"><h2 className="font-heading text-lg font-bold text-text-primary">Prepare &amp; Enrich</h2><p className="mt-2 text-sm text-text-muted">Documents can be added after this Couple has a counseling case.</p></Card>;
  return <Card className="p-5"><h2 className="font-heading text-lg font-bold text-text-primary">Prepare &amp; Enrich</h2><p className="mt-1 text-sm text-text-muted">Manage the current document for each Couple slot.</p><div className="mt-5 space-y-4"><DocumentSlot coupleGroupId={coupleGroupId} counselingCaseId={counselingCaseId} slot="counselor" document={documents.find((document) => document.slot === "counselor") ?? null} /><DocumentSlot coupleGroupId={coupleGroupId} counselingCaseId={counselingCaseId} slot="couple" document={documents.find((document) => document.slot === "couple") ?? null} /></div></Card>;
}
