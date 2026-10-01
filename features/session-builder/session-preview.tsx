"use client";

import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";

import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import { HomeworkPreviewContent, VideoLinkPreview } from "@/features/homework/homework-preview";
import type { StagedHomeworkBlock } from "@/features/homework/homework-editor-model";
import type { StagedMaterialBlock } from "./editor-model";
import { formatResourceFileSize, formatResourceFileType } from "@/features/resource-library/policy";

export function sessionPreviewTargetPage(pages: StagedMaterialBlock[], currentKey: string | null, direction: -1 | 1) {
  const currentIndex = Math.max(0, pages.findIndex(({ key }) => key === currentKey));
  return pages[currentIndex + direction]?.key ?? null;
}

export function SessionPreview({ open, onOpenChange, tab, onTabChange, materialBlocks, homeworkBlocks, resourceAccess = {} }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: "material" | "homework";
  onTabChange: (tab: "material" | "homework") => void;
  materialBlocks: StagedMaterialBlock[];
  homeworkBlocks: StagedHomeworkBlock[];
  resourceAccess?: Record<string, string>;
}) {
  const backToEditing = useRef<HTMLButtonElement>(null);
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" showCloseButton={false} className="h-dvh w-full max-w-none gap-0 overflow-hidden p-0 sm:w-[min(72rem,calc(100vw-2rem))] sm:max-w-none"
      onOpenAutoFocus={(event) => { event.preventDefault(); backToEditing.current?.focus(); }}>
      <SheetHeader className="flex-none flex-row items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-8 sm:py-6">
        <div className="min-w-0"><SheetTitle className="text-xl text-text-primary sm:text-2xl">Preview</SheetTitle><SheetDescription className="mt-1">Review the current staged Session Material and Homework.</SheetDescription></div>
        <SheetClose asChild><button ref={backToEditing} type="button" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:text-brand-primary"><ArrowLeft className="size-4" aria-hidden="true" />Back to Editing</button></SheetClose>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-7">
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as "material" | "homework")}>
          <TabsList aria-label="Preview sections"><TabsTrigger value="material">Session Material</TabsTrigger><TabsTrigger value="homework">Homework</TabsTrigger></TabsList>
          <TabsContent value="material"><SessionMaterialPreviewContent blocks={materialBlocks} resourceAccess={resourceAccess} /></TabsContent>
          <TabsContent value="homework"><HomeworkPreviewContent blocks={homeworkBlocks} /></TabsContent>
        </Tabs>
      </div>
    </SheetContent>
  </Sheet>;
}

export function SessionMaterialPreviewContent({ blocks, resourceAccess = {} }: { blocks: StagedMaterialBlock[]; resourceAccess?: Record<string, string> }) {
  const pages = blocks.filter((block) => block.blockType === "rich_text");
  const resources = blocks.filter((block) => block.blockType !== "rich_text");
  const [pageKey, setPageKey] = useState<string | null>(null);

  if (!pages.length && !resources.length) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-text-muted">No Session Material yet.</p>;
  const selectedIndex = pages.findIndex(({ key }) => key === pageKey);
  const pageIndex = selectedIndex < 0 ? 0 : selectedIndex;
  const page = pages[pageIndex];
  return <div className="mx-auto grid max-w-3xl gap-8">
    {page ? <section aria-label="Session Material Page" className="grid gap-5">
      <p className="text-sm font-medium text-text-muted">Page {pageIndex + 1} of {pages.length}</p>
      <article className="overflow-hidden rounded-lg border border-border bg-white">
        <h2 className="p-4 pb-0 font-heading text-xl font-bold text-text-primary">{page.title}</h2>
        {page.richTextContent ? <RichTextReadOnly content={page.richTextContent} /> : null}
      </article>
      <nav aria-label="Page navigation" className="flex items-center justify-between gap-3">
        <button type="button" disabled={pageIndex === 0} onClick={() => setPageKey(sessionPreviewTargetPage(pages, page.key, -1))} className="min-h-10 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Previous Page</button>
        <button type="button" disabled={pageIndex >= pages.length - 1} onClick={() => setPageKey(sessionPreviewTargetPage(pages, page.key, 1))} className="min-h-10 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Next Page</button>
      </nav>
    </section> : null}
    {resources.length ? <section aria-labelledby="session-preview-resources"><h2 id="session-preview-resources" className="mb-4 font-heading text-xl font-bold text-text-primary">Resources</h2><div className="grid gap-4">{resources.map((resource) => resource.blockType === "library_resource"
      ? <LibraryResourcePreview key={resource.key} block={resource} url={resource.resourceId ? resourceAccess[resource.resourceId] : undefined} />
      : <VideoLinkPreview key={resource.key} title={resource.title} description={resource.description} url={resource.url} />)}</div></section> : null}
  </div>;
}

function LibraryResourcePreview({ block, url }: { block: StagedMaterialBlock; url?: string }) {
  const resource = block.resource;
  if (!resource) return <p className="rounded-md border border-border p-4 text-sm text-text-muted">Resource unavailable.</p>;
  const download = `/resource-library/${resource.id}/download`;
  const open = `/resource-library/${resource.id}/open`;
  return <article className="grid gap-3 rounded-lg border border-border bg-white p-4">
    <div><h3 className="text-base font-semibold text-text-primary">{resource.title}</h3>{resource.description ? <p className="mt-1 text-sm text-text-muted">{resource.description}</p> : null}</div>
    {resource.category === "image" && url ? <Image unoptimized src={url} alt={resource.title} width={960} height={540} className="max-h-[32rem] w-full rounded-md object-contain" /> : null}
    {resource.category === "audio" && url ? <audio controls src={url} aria-label={resource.title} className="w-full">Your browser cannot play this audio.</audio> : null}
    {resource.category === "video" && url ? <video controls src={url} aria-label={resource.title} className="max-h-[32rem] w-full rounded-md">Your browser cannot play this video.</video> : null}
    {resource.category === "document" ? <p className="text-sm text-text-muted">{formatResourceFileType(resource.currentVersion.mimeType)} · {formatResourceFileSize(resource.currentVersion.sizeBytes)}</p> : null}
    {!url && resource.category !== "document" ? <p role="status" className="text-sm text-text-muted">Loading private Resource…</p> : null}
    <div className="flex gap-4 text-sm font-semibold text-brand-primary"><a href={open} target="_blank" rel="noopener noreferrer">Open</a><a href={download} target="_blank" rel="noopener noreferrer">Download</a></div>
  </article>;
}
