"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RESOURCE_POLICY, formatResourceFileSize, resourceCategoryForMime, resourceFileAccept, resourceTitleFromFilename, validateResourceFile, validateResourceMetadata } from "./policy";
import type { ResourceLibraryItem } from "./presentation";
import { abandonResourceUpload, finishResourceUpload, reserveResourceUpload } from "./actions";
import { uploadResourceFileDirect, type BrowserUploadFile } from "./uploads";

type Stage = "idle" | "preparing" | "uploading" | "finalizing";

export function ResourceUploadSheet({ open, onOpenChange, replacement, onFinished }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacement: ResourceLibraryItem | null;
  onFinished: (cleanupWarning?: boolean) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== "idle";

  function reset() {
    setFile(null);
    setTitle("");
    setDescription("");
    setStage("idle");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function changeOpen(nextOpen: boolean) {
    if (busy) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setError(null);
    if (!nextFile) return;
    if (!replacement) setTitle(resourceTitleFromFilename(nextFile.name));
    const category = resourceCategoryForMime(nextFile.type);
    if (!category) { setError("This file type is not supported. Choose a supported image, document, audio, or video file."); return; }
    if (replacement && category !== replacement.category) { setError(`Choose a ${replacement.category} file to replace this Resource.`); return; }
    try { validateResourceFile({ category, mimeType: nextFile.type, sizeBytes: nextFile.size, originalFilename: nextFile.name }); }
    catch (validationError) { setError(validationError instanceof Error ? validationError.message : "This file cannot be uploaded."); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!file) { setError("Choose a file to upload."); return; }
    const category = resourceCategoryForMime(file.type);
    if (!category) { setError("This file type is not supported."); return; }
    if (replacement && category !== replacement.category) { setError(`Choose a ${replacement.category} file to replace this Resource.`); return; }
    const metadata = replacement ? { title: replacement.title, description: replacement.description } : { title, description };
    if (!replacement) {
      try { validateResourceMetadata(metadata); }
      catch (validationError) { setError(validationError instanceof Error ? validationError.message : "Enter a Resource title."); return; }
    }
    setStage("preparing");
    try {
      const result = await uploadResourceFileDirect({
        prepare: reserveResourceUpload,
        upload: async (path, token, selectedFile) => {
          const { error: uploadError } = await createBrowserSupabaseClient().storage
            .from(RESOURCE_POLICY.bucket)
            .uploadToSignedUrl(path, token, selectedFile, { contentType: selectedFile.type, upsert: false });
          return { error: uploadError?.message ?? null };
        },
        finalize: finishResourceUpload,
        cancel: abandonResourceUpload,
      }, file as BrowserUploadFile, metadata, category, replacement?.id, setStage);
      if (result.maintenance.errors.length) {
        reset();
        await onFinished(true);
        return;
      }
      reset();
      await onFinished();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The Resource could not be uploaded. Please try again.");
      setStage("idle");
    }
  }

  const stageLabel = stage === "preparing" ? "Preparing upload..." : stage === "uploading" ? "Uploading directly to secure storage..." : stage === "finalizing" ? "Finalizing Resource..." : "";

  return <Sheet open={open} onOpenChange={changeOpen}>
    <SheetContent side="right" className="w-[min(30rem,100vw)] max-w-none overflow-y-auto p-0 sm:w-[min(30rem,88vw)]">
      <SheetHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
        <SheetTitle>{replacement ? "Replace Resource File" : "Upload Resource"}</SheetTitle>
        <SheetDescription>{replacement ? `Choose a new ${replacement.category} file. The current file stays available unless the replacement finishes successfully.` : "Add a reusable file to the Resource Library."}</SheetDescription>
      </SheetHeader>
      <form onSubmit={(event) => void submit(event)} className="grid gap-5 p-5 sm:p-6">
        {replacement ? <p className="rounded-md bg-surface-muted p-3 text-sm leading-5 text-text-muted">Current file: <span className="break-all font-medium text-text-primary">{replacement.currentVersion.originalFilename}</span></p> : null}
        <div className="grid gap-2">
          <span className="text-sm font-semibold text-text-primary">File</span>
          <input ref={inputRef} type="file" accept={resourceFileAccept()} disabled={busy} onChange={(event) => chooseFile(event.currentTarget.files?.[0] ?? null)} className="sr-only" id="resource-upload-file" aria-label="Choose a Resource file" />
          <label htmlFor="resource-upload-file" aria-disabled={busy} className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-muted px-4 py-5 text-center transition hover:bg-sidebar-accent ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <FileUp className="size-6 text-brand-secondary" aria-hidden="true" />
            <span className="text-sm font-semibold text-brand-primary">{file ? "Choose a different file" : "Choose a file"}</span>
            <span className="max-w-full break-all text-xs text-text-muted">{file ? `${file.name} · ${formatResourceFileSize(file.size)}` : "Select a supported image, document, audio, or video file."}</span>
          </label>
        </div>
        {!replacement ? <>
          <label className="grid gap-1.5 text-sm font-medium text-text-primary">Title<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} className="min-h-10 rounded-md border border-border bg-white px-3 outline-none focus:border-brand-primary" /></label>
          <label className="grid gap-1.5 text-sm font-medium text-text-primary">Description <span className="font-normal text-text-muted">Optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={4} className="resize-y rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-brand-primary" /></label>
        </> : null}
        {file ? <p className="text-xs text-text-muted">Category: {resourceCategoryForMime(file.type) ?? "Unsupported"}. Allowed maximum: {resourceCategoryForMime(file.type) ? formatResourceFileSize(RESOURCE_POLICY.categories[resourceCategoryForMime(file.type)!].maxBytes) : "—"}.</p> : null}
        {error ? <p role="alert" className="break-words text-sm text-danger-strong">{error}</p> : null}
        {busy ? <p role="status" className="text-sm font-medium text-brand-primary">{stageLabel}</p> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={() => changeOpen(false)} className="min-h-10 rounded-md px-4 text-sm font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={busy || !file || Boolean(error)} className="min-h-10 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Uploading..." : replacement ? "Replace file" : "Upload Resource"}</button>
        </div>
      </form>
    </SheetContent>
  </Sheet>;
}
