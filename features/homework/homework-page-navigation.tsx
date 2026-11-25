"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { HomeworkPage } from "./homework-editor-model";

export function homeworkPageIndexForId(pages: HomeworkPage[], pageId: string) {
  return pages.findIndex((page) => page.id === pageId);
}

export function adjacentHomeworkPageIndex(pageIndex: number, direction: -1 | 1, pageCount: number) {
  return Math.max(0, Math.min(pageCount - 1, pageIndex + direction));
}

export function HomeworkPageNavigation({ pages, pageIndex, onPageIndexChange }: {
  pages: HomeworkPage[];
  pageIndex: number;
  onPageIndexChange: (pageIndex: number) => void;
}) {
  const currentPage = pages[pageIndex] ?? pages[0];
  if (!currentPage) return null;

  return <header className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h3 className="font-heading break-words text-xl font-bold text-text-primary">{currentPage.title || `Page ${pageIndex + 1}`}</h3>
      {pages.length > 1 ? <p className="mt-1 text-sm font-medium text-text-muted">Page {pageIndex + 1} of {pages.length}</p> : null}
    </div>
    {pages.length > 1 ? <nav aria-label="Homework page navigation" className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <Select value={currentPage.id} onValueChange={(pageId) => {
        const nextPageIndex = homeworkPageIndexForId(pages, pageId);
        if (nextPageIndex >= 0) onPageIndexChange(nextPageIndex);
      }}>
        <SelectTrigger aria-label="Choose Homework page" className="col-span-2 min-w-0 sm:w-64"><SelectValue /></SelectTrigger>
        <SelectContent>{pages.map((page, index) => <SelectItem key={page.id} value={page.id}>Page {index + 1}: {page.title || `Page ${index + 1}`}</SelectItem>)}</SelectContent>
      </Select>
      <button type="button" disabled={pageIndex === 0} onClick={() => onPageIndexChange(adjacentHomeworkPageIndex(pageIndex, -1, pages.length))} className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Previous Page</button>
      <button type="button" disabled={pageIndex >= pages.length - 1} onClick={() => onPageIndexChange(adjacentHomeworkPageIndex(pageIndex, 1, pages.length))} className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Next Page</button>
    </nav> : null}
  </header>;
}
