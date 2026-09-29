"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FileAudio, FileText, Pencil, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isDeleteConfirmation } from "@/components/shared/destructive-confirmation";
import { formatResourceFileSize } from "./policy";
import type { ResourceLibraryItem } from "./presentation";
import { loadResourceDetail, removeResource, saveResourceMetadata, setResourceArchived } from "./actions";

type Detail = {
  title: string;
  description: string | null;
  category: ResourceLibraryItem["category"];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canManage: boolean;
  currentVersion: { originalFilename: string; mimeType: string; sizeBytes: number; uploadedAt: string; uploaderName: string };
  previewUrl: string;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function FilePreview({ detail }: { detail: Detail }) {
  if (detail.category === "image") return <Image src={detail.previewUrl} alt={detail.title} width={1000} height={720} unoptimized className="max-h-[42vh] w-full rounded-md bg-surface-muted object-contain" />;
  if (detail.category === "audio") return <div className="grid min-h-40 place-items-center rounded-md bg-surface-muted p-5 text-brand-secondary"><FileAudio className="size-10" aria-hidden="true" /><audio className="mt-5 w-full" controls preload="none" src={detail.previewUrl}>Audio playback is not supported by this browser.</audio></div>;
  if (detail.category === "video") return <video className="max-h-[42vh] w-full rounded-md bg-black" controls playsInline preload="metadata" src={detail.previewUrl}>Video playback is not supported by this browser.</video>;
  return <div className="grid min-h-40 place-items-center rounded-md bg-surface-muted p-5 text-brand-secondary"><FileText className="size-10" aria-hidden="true" /><p className="mt-3 text-sm font-semibold text-text-primary">{detail.currentVersion.mimeType === "application/pdf" ? "PDF document" : "Document"}</p></div>;
}

export function ResourceDetailSheet({ item, isAdmin, onClose, onChanged, onReplace, onDeleted }: {
  item: ResourceLibraryItem | null;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: (archived?: boolean) => Promise<boolean>;
  onReplace: (item: ResourceLibraryItem) => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pendingAction, setPendingAction] = useState<"archive" | "restore" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const resourceId = item?.id;

  useEffect(() => {
    let current = true;
    if (resourceId) void loadResourceDetail(resourceId).then((result) => {
      if (!current) return;
      if ("error" in result) setDetailError("Resource details could not be loaded. Please try again.");
      else setDetail(result.data as Detail);
    });
    return () => { current = false; };
  }, [resourceId]);

  function openAction(action: "archive" | "restore" | "delete") {
    setConfirmation("");
    setActionError(null);
    setPendingAction(action);
  }

  async function confirmAction() {
    if (!item || !pendingAction || actionPending) return;
    setActionPending(true);
    const result = pendingAction === "delete"
      ? await removeResource(item.id, confirmation)
      : await setResourceArchived(item.id, pendingAction === "archive");
    setActionPending(false);
    if ("error" in result) { setActionError(result.error); return; }
    const action = pendingAction;
    setPendingAction(null);
    if (action === "delete") {
      toast.success("Resource permanently deleted");
      onDeleted();
      return;
    }
    toast.success(action === "archive" ? "Resource archived" : "Resource restored");
    onClose();
    await onChanged(action === "restore");
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item || !detail || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setEditError(null);
    const result = await saveResourceMetadata(item.id, { title: String(form.get("title") ?? ""), description: String(form.get("description") ?? "") });
    setSaving(false);
    if ("error" in result) { setEditError(result.error); return; }
    toast.success("Resource details saved");
    setEditing(false);
    await onChanged();
    const refreshed = await loadResourceDetail(item.id);
    if ("data" in refreshed) setDetail(refreshed.data as Detail);
  }

  function startDownload() {
    if (!item) return;
    setDownloading(true);
    // Keep this as a native browser navigation so Storage serves the file directly.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/resource-library/${encodeURIComponent(item.id)}/download`);
  }

  const activeDetail = detail ?? (item ? {
    title: item.title,
    description: item.description,
    category: item.category,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    canManage: item.canManage,
    currentVersion: { originalFilename: item.currentVersion.originalFilename, mimeType: item.currentVersion.mimeType, sizeBytes: item.currentVersion.sizeBytes, uploadedAt: item.currentVersion.uploadedAt, uploaderName: "Loading..." },
    previewUrl: item.previewUrl ?? "",
  } satisfies Detail : null);

  return <>
    <Sheet open={item !== null} onOpenChange={(open) => { if (!open && !actionPending) onClose(); }}>
      <SheetContent side="right" className="w-[min(32rem,100vw)] max-w-none overflow-y-auto p-0 sm:w-[min(32rem,88vw)]">
        {activeDetail ? <>
          <SheetHeader className="border-b border-border px-5 py-5 pr-14 sm:px-6">
            <SheetTitle className="break-words text-left text-xl">{activeDetail.title}</SheetTitle>
            <SheetDescription className="text-left">{activeDetail.category[0].toUpperCase() + activeDetail.category.slice(1)}{activeDetail.archivedAt ? " · Archived" : ""}</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 p-5 sm:p-6">
            {detailError ? <p role="alert" className="text-sm text-danger-strong">{detailError}</p> : activeDetail.previewUrl ? <FilePreview detail={activeDetail} /> : <p role="status" className="rounded-md bg-surface-muted p-4 text-sm text-text-muted">Loading secure preview...</p>}
            {activeDetail.description ? <p className="break-words text-sm leading-6 text-text-muted">{activeDetail.description}</p> : null}
            <div className="flex flex-wrap gap-2">
              {activeDetail.previewUrl ? <a href={activeDetail.previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-3.5 text-sm font-semibold text-white focus-visible:bg-brand-secondary"><ExternalLink className="size-4" aria-hidden="true" />Open</a> : null}
              <button type="button" onClick={startDownload} disabled={downloading} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sidebar-accent px-3.5 text-sm font-semibold text-sidebar-active focus-visible:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"><Download className="size-4" aria-hidden="true" />{downloading ? "Downloading..." : "Download"}</button>
            </div>
            <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
              <dt className="text-text-muted">File name</dt><dd className="min-w-0 break-words text-text-primary">{activeDetail.currentVersion.originalFilename}</dd>
              <dt className="text-text-muted">File type</dt><dd className="min-w-0 break-all text-text-primary">{activeDetail.currentVersion.mimeType}</dd>
              <dt className="text-text-muted">File size</dt><dd className="text-text-primary">{formatResourceFileSize(activeDetail.currentVersion.sizeBytes)}</dd>
              <dt className="text-text-muted">Uploaded by</dt><dd className="text-text-primary">{activeDetail.currentVersion.uploaderName}</dd>
              <dt className="text-text-muted">Uploaded</dt><dd className="text-text-primary">{dateLabel(activeDetail.currentVersion.uploadedAt)}</dd>
              <dt className="text-text-muted">Last updated</dt><dd className="text-text-primary">{dateLabel(activeDetail.updatedAt)}</dd>
            </dl>
            {activeDetail.canManage ? <section className="grid gap-3 border-t border-border pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-heading font-bold text-text-primary">Manage resource</h3><span className="text-xs text-text-muted">Updated {dateLabel(activeDetail.updatedAt)}</span></div>
              {editing ? <form onSubmit={(event) => void saveDetails(event)} className="grid gap-3">
                <label className="grid gap-1.5 text-sm font-medium">Title<input name="title" required maxLength={180} defaultValue={activeDetail.title} className="min-h-10 rounded-md border border-border bg-white px-3 outline-none focus:border-brand-primary" /></label>
                <label className="grid gap-1.5 text-sm font-medium">Description<textarea name="description" maxLength={4000} rows={4} defaultValue={activeDetail.description ?? ""} className="resize-y rounded-md border border-border bg-white px-3 py-2 outline-none focus:border-brand-primary" /></label>
                {editError ? <p role="alert" className="text-sm text-danger-strong">{editError}</p> : null}
                <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditing(false)} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-3.5 text-sm font-semibold text-white disabled:opacity-60"><Save className="size-4" aria-hidden="true" />{saving ? "Saving..." : "Save details"}</button></div>
              </form> : <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setEditError(null); setEditing(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sidebar-accent px-3.5 text-sm font-semibold text-sidebar-active focus-visible:bg-surface-muted"><Pencil className="size-4" aria-hidden="true" />Edit details</button>
                {!activeDetail.archivedAt && item ? <button type="button" onClick={() => onReplace(item)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sidebar-accent px-3.5 text-sm font-semibold text-sidebar-active focus-visible:bg-surface-muted"><Upload className="size-4" aria-hidden="true" />Replace file</button> : null}
              </div>}
              {isAdmin ? <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                {activeDetail.archivedAt ? <button type="button" onClick={() => openAction("restore")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-sidebar-accent px-3.5 text-sm font-semibold text-sidebar-active"><RotateCcw className="size-4" aria-hidden="true" />Restore resource</button> : <button type="button" onClick={() => openAction("archive")} className="min-h-10 rounded-md px-3.5 text-sm font-semibold text-text-muted hover:bg-surface-muted">Archive</button>}
                <button type="button" onClick={() => openAction("delete")} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3.5 text-sm font-semibold text-danger-strong hover:bg-danger-soft"><Trash2 className="size-4" aria-hidden="true" />Delete permanently</button>
              </div> : null}
            </section> : null}
          </div>
        </> : <div className="p-6"><SheetHeader><SheetTitle>Resource details</SheetTitle><SheetDescription>Loading resource details...</SheetDescription></SheetHeader>{detailError ? <p role="alert" className="mt-4 text-sm text-danger-strong">{detailError}</p> : <p role="status" className="mt-4 text-sm text-text-muted">Loading secure resource details...</p>}</div>}
      </SheetContent>
    </Sheet>

    <AlertDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open && !actionPending) { setPendingAction(null); setActionError(null); } }}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingAction === "delete" ? "Permanently delete Resource?" : pendingAction === "archive" ? "Archive Resource?" : "Restore Resource?"}</AlertDialogTitle>
          <AlertDialogDescription>{pendingAction === "delete" ? "Permanent deletion is available only for unused Resources. Referenced Resources are protected and remain unchanged." : pendingAction === "archive" ? "This Resource and its versions will be preserved and hidden from the active library." : "This Resource will return to the active library."}</AlertDialogDescription>
        </AlertDialogHeader>
        {pendingAction === "delete" ? <label className="grid gap-2 text-sm font-medium" htmlFor="resource-delete-confirmation">Type <span className="font-mono font-bold text-danger-strong">DELETE</span> to confirm<input id="resource-delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-md border border-border bg-white px-3 font-mono text-sm outline-none focus:border-brand-primary" /></label> : pendingAction === "archive" ? <p className="flex items-start gap-2 rounded-md bg-surface-muted p-3 text-sm leading-5 text-text-muted"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />You can restore it later from the Archived view.</p> : null}
        {actionError ? <p role="alert" className="text-sm text-danger-strong">{actionError}</p> : null}
        <div className="mt-2 flex justify-end gap-2"><button type="button" disabled={actionPending} onClick={() => setPendingAction(null)} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted">Cancel</button><button type="button" disabled={actionPending || (pendingAction === "delete" && !isDeleteConfirmation(confirmation))} onClick={() => void confirmAction()} className={`min-h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 ${pendingAction === "delete" ? "bg-danger-strong" : "bg-brand-primary"}`}>{actionPending ? "Working..." : pendingAction === "delete" ? "Delete permanently" : pendingAction === "archive" ? "Archive Resource" : "Restore Resource"}</button></div>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
