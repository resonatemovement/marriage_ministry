"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { formatResourceFileSize } from "./policy";
import { filterResourceItems, RESOURCE_CATEGORY_FILTERS, resourceEmptyState, type ResourceCategoryFilter, type ResourceLibraryItem } from "./presentation";
import { reloadResourceLibrary } from "./actions";
import { ResourceDetailSheet } from "./resource-detail-sheet";
import { ResourceUploadSheet } from "./resource-upload-sheet";
import { ResourceThumbnail } from "./resource-thumbnail";

function ResourceCard({ item, archived, onOpen }: { item: ResourceLibraryItem; archived: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${item.title} details`}
      className="group min-w-0 overflow-hidden rounded-lg border border-border bg-surface text-left shadow-[0_1px_2px_rgba(43,45,42,0.04),0_8px_24px_rgba(43,45,42,0.035)] transition hover:border-brand-primary/45 hover:shadow-[0_6px_24px_rgba(43,45,42,0.1)] focus-visible:border-brand-primary focus-visible:bg-sidebar-accent"
    >
      <ResourceThumbnail item={item}>
        {archived ? <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-text-muted shadow-sm">Archived</span> : null}
      </ResourceThumbnail>
      <div className="min-w-0 p-4">
        <h2 className="truncate font-heading text-base font-bold text-text-primary" title={item.title}>{item.title}</h2>
        <p className="mt-1 truncate text-xs text-text-muted" title={item.currentVersion.originalFilename}>
          {item.category[0].toUpperCase() + item.category.slice(1)} <span aria-hidden="true">·</span> {formatResourceFileSize(item.currentVersion.sizeBytes)}
        </p>
      </div>
    </button>
  );
}

const emptyCopy = {
  "no-resources": { title: "No resources yet", message: "Upload images, documents, audio, and video so they can be reused throughout the application." },
  "no-search-results": { title: "No matching resources", message: "Try another title, filename, or description." },
  "no-category-results": { title: "No resources in this category", message: "Choose another category to see more resources." },
  "no-archived": { title: "No archived resources", message: "Archived resources will appear here and can be restored by an Admin." },
} as const;

export function ResourceLibrary({ initialResources, initialCount, initialError, isAdmin }: {
  initialResources: ResourceLibraryItem[];
  initialCount: number;
  initialError: string | null;
  isAdmin: boolean;
}) {
  const [resources, setResources] = useState(initialResources);
  const [count, setCount] = useState(initialCount);
  const [loadError, setLoadError] = useState(initialError);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ResourceCategoryFilter>("all");
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replacement, setReplacement] = useState<ResourceLibraryItem | null>(null);
  const [selected, setSelected] = useState<ResourceLibraryItem | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("downloadError") !== "1") return;
    toast.error("A secure Resource download could not be started.");
    url.searchParams.delete("downloadError");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const visible = useMemo(() => filterResourceItems(resources, category, search), [resources, category, search]);
  const empty = resourceEmptyState(resources, visible, category, search, archived);

  async function refreshLibrary(nextArchived = archived) {
    const result = await reloadResourceLibrary(nextArchived);
    if ("error" in result) {
      setLoadError("Resource Library could not be refreshed. Please try again.");
      return false;
    }
    setResources(result.data.resources);
    setCount(result.data.count);
    setLoadError(null);
    return true;
  }

  async function changeArchiveView(nextArchived: boolean) {
    setArchived(nextArchived);
    setSearch("");
    setCategory("all");
    setLoading(true);
    if (!(await refreshLibrary(nextArchived))) toast.error("Resource Library could not be loaded.");
    setLoading(false);
  }

  async function uploadFinished(cleanupWarning = false) {
    const wasReplacement = replacement !== null;
    setUploadOpen(false);
    setReplacement(null);
    if (await refreshLibrary()) {
      if (cleanupWarning) toast.warning("The file is available, but older file cleanup needs administrator attention.");
      else toast.success(wasReplacement ? "Resource file replaced" : "Resource uploaded");
    }
    else toast.warning("The upload succeeded, but the library could not refresh.");
    setSelected(null);
  }

  function beginReplacement(item: ResourceLibraryItem) {
    setSelected(null);
    setReplacement(item);
    setUploadOpen(true);
  }

  return (
    <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Marriage Ministry</p>
          <h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Resource Library</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">Manage images, documents, audio, and video used throughout the application.</p>
        </div>
        <button type="button" onClick={() => { setReplacement(null); setUploadOpen(true); }} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 focus-visible:bg-brand-secondary"><Plus className="size-4" aria-hidden="true" />Upload Resource</button>
      </div>

      <Card className="mt-7 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search resources</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search resources..." className="h-11 w-full rounded-md border border-border bg-white pl-10 pr-3 text-sm text-text-primary outline-none focus:border-brand-primary" />
          </label>
          {isAdmin ? <div role="group" aria-label="Resource status" className="flex rounded-md bg-surface-muted p-1">
            {[{ value: false, label: "Active" }, { value: true, label: "Archived" }].map((view) => <button key={view.label} type="button" aria-pressed={archived === view.value} disabled={loading} onClick={() => void changeArchiveView(view.value)} className={`min-h-9 flex-1 rounded px-3 text-sm font-semibold transition focus-visible:bg-white ${archived === view.value ? "bg-white text-brand-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`}>{view.label}</button>)}
          </div> : null}
        </div>
        <div role="group" aria-label="Filter by category" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {RESOURCE_CATEGORY_FILTERS.map((filter) => <button key={filter.value} type="button" aria-pressed={category === filter.value} onClick={() => setCategory(filter.value)} className={`min-h-9 shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:bg-sidebar-accent focus-visible:text-brand-primary ${category === filter.value ? "bg-sidebar-accent text-sidebar-active" : "bg-surface-muted text-text-muted hover:text-text-primary"}`}>{filter.label}</button>)}
        </div>
      </Card>

      {loadError ? <Card className="mt-6 p-8 text-center"><FolderOpen className="mx-auto size-8 text-text-muted" aria-hidden="true" /><h2 className="font-heading mt-3 text-lg font-bold text-text-primary">Resource Library is unavailable</h2><p className="mt-2 text-sm text-text-muted">{loadError}</p><button type="button" onClick={() => void refreshLibrary()} className="mt-4 min-h-10 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white">Try again</button></Card>
        : loading ? <p role="status" className="py-12 text-center text-sm text-text-muted">Loading resources...</p>
          : visible.length ? <>
            <p className="mt-5 text-sm text-text-muted" aria-live="polite">{visible.length} {visible.length === 1 ? "resource" : "resources"}{search || category !== "all" ? " shown" : ""}{count > resources.length ? ` · Most recent ${resources.length} of ${count}` : ""}</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visible.map((item) => <ResourceCard key={item.id} item={item} archived={archived} onOpen={() => setSelected(item)} />)}</div>
          </> : empty ? <Card className="mt-6 p-8 text-center sm:p-12"><FolderOpen className="mx-auto size-9 text-brand-secondary" aria-hidden="true" /><h2 className="font-heading mt-4 text-xl font-bold text-text-primary">{emptyCopy[empty].title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-muted">{emptyCopy[empty].message}</p>{empty === "no-resources" ? <button type="button" onClick={() => { setReplacement(null); setUploadOpen(true); }} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white focus-visible:bg-brand-secondary"><Plus className="size-4" aria-hidden="true" />Upload Resource</button> : null}</Card> : null}

      <ResourceUploadSheet open={uploadOpen} onOpenChange={(open) => { if (!open) { setUploadOpen(false); setReplacement(null); } }} replacement={replacement} onFinished={uploadFinished} />
      <ResourceDetailSheet key={selected?.id ?? "closed"} item={selected} isAdmin={isAdmin} onClose={() => setSelected(null)} onChanged={refreshLibrary} onReplace={beginReplacement} onDeleted={() => { setSelected(null); void refreshLibrary(); }} />
    </main>
  );
}
