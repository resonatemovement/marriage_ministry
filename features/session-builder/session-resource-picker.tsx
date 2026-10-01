"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";

import { focusFirstDialogTextField } from "@/components/ui/dialog-focus";
import { filterResourceItems, sessionResourcePickerEmptyState, type ResourceLibraryItem } from "@/features/resource-library/presentation";
import { formatResourceFileSize, formatResourceFileType, type ResourceCategory } from "@/features/resource-library/policy";
import { ResourceThumbnail, ResourceTypeIcon } from "@/features/resource-library/resource-thumbnail";
import { findSessionResources } from "./resource-actions";

export const RESOURCE_PICKER_COPY: Record<ResourceCategory, { title: string; description: string; search: string; empty: string; searchEmpty: string }> = {
  image: { title: "Select Image", description: "Choose an image from the Resource Library.", search: "Search images...", empty: "No images available. Upload images to the Resource Library before adding one to this Session.", searchEmpty: "No images match your search." },
  document: { title: "Select Document", description: "Choose a document from the Resource Library.", search: "Search documents...", empty: "No documents available.", searchEmpty: "No documents match your search." },
  audio: { title: "Select Audio", description: "Choose audio from the Resource Library.", search: "Search audio...", empty: "No audio available.", searchEmpty: "No audio matches your search." },
  video: { title: "Select Video", description: "Choose an uploaded video from the Resource Library.", search: "Search videos...", empty: "No videos available.", searchEmpty: "No videos match your search." },
};

export function SessionResourcePicker({ category, onClose, onSelect }: {
  category: ResourceCategory;
  onClose: () => void;
  onSelect: (resource: ResourceLibraryItem) => void;
}) {
  const [items, setItems] = useState<ResourceLibraryItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    findSessionResources(category).then((result) => { if (live) setItems(result); })
      .catch(() => { if (live) setError("Resources could not be loaded. Please try again."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [category]);
  const visible = filterResourceItems(items, category, search);
  const emptyState = sessionResourcePickerEmptyState(items, visible, search);
  const copy = RESOURCE_PICKER_COPY[category];

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content onOpenAutoFocus={focusFirstDialogTextField}
        className="fixed inset-x-2 top-1/2 z-50 flex h-[min(92dvh,900px)] max-h-[calc(100dvh-1rem)] -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-background shadow-xl sm:inset-x-6 sm:left-1/2 sm:right-auto sm:w-[min(1152px,calc(100vw-3rem))] sm:-translate-x-1/2">
        <header className="relative shrink-0 border-b border-border px-4 py-4 pr-14 sm:px-6 sm:py-5">
          <Dialog.Title className="font-heading text-lg font-bold text-text-primary sm:text-xl">{copy.title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-text-muted">{copy.description}</Dialog.Description>
          <Dialog.Close aria-label="Close Resource picker" className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent sm:right-4 sm:top-4">
            <X className="size-4" aria-hidden="true" /><span className="sr-only">Close</span>
          </Dialog.Close>
        </header>
        <div className="grid shrink-0 gap-2 px-4 py-4 sm:px-6">
          <label className="grid gap-1 text-sm font-medium text-text-primary">Search Resources
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search}
              className="min-h-10 rounded-md border border-border px-3 text-sm outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6">
          {loading ? <p role="status" className="py-2 text-sm text-text-muted">Loading Resources…</p> : null}
          {error ? <p role="alert" className="py-2 text-sm text-danger-strong">{error}</p> : null}
          {!loading && !error && emptyState === "no-resources" ? <p className="py-2 text-sm text-text-muted">{copy.empty}</p> : null}
          {!loading && !error && emptyState === "no-search-results" ? <p className="py-2 text-sm text-text-muted">{copy.searchEmpty}</p> : null}
          <div className={category === "image" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
            {visible.map((item) => <SessionResourcePickerCard key={item.id} item={item} category={category} onSelect={onSelect} />)}
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function SessionResourcePickerCard({ item, category, onSelect }: {
  item: ResourceLibraryItem;
  category: ResourceCategory;
  onSelect: (resource: ResourceLibraryItem) => void;
}) {
  const detail = `${formatResourceFileType(item.currentVersion.mimeType)} · ${formatResourceFileSize(item.currentVersion.sizeBytes)}`;

  if (category === "image") return <button type="button" onClick={() => onSelect(item)} aria-label={`Select ${item.title}`}
    className="group min-w-0 overflow-hidden rounded-lg border border-border bg-surface text-left transition hover:border-brand-primary/45 hover:shadow-sm focus-visible:border-brand-primary focus-visible:bg-sidebar-accent">
    <ResourceThumbnail item={item} alt={`Preview of ${item.title}`} />
    <span className="block min-w-0 p-3 sm:p-4"><span className="block truncate font-heading text-sm font-bold text-text-primary" title={item.title}>{item.title}</span>
      <span className="mt-1 block truncate text-xs text-text-muted">{detail}</span></span>
  </button>;

  return <button type="button" onClick={() => onSelect(item)} aria-label={`Select ${item.title}`}
    className="flex min-h-24 min-w-0 items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:border-brand-primary/45 hover:bg-sidebar-accent focus-visible:border-brand-primary sm:p-4">
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-md bg-surface-muted text-brand-primary"><ResourceTypeIcon category={category} className="size-6" /></span>
    <span className="min-w-0"><span className="block truncate font-heading text-sm font-bold text-text-primary" title={item.title}>{item.title}</span>
      <span className="mt-1 block truncate text-xs text-text-muted">{detail}</span></span>
  </button>;
}
