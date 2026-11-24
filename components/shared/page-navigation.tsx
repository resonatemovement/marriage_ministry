import { Plus } from "lucide-react";

export type PageNavigationItem = {
  id: string;
  title: string;
};

type PageNavigationProps = {
  ariaLabel: string;
  pages: PageNavigationItem[];
  selectedPageId?: string;
  emptyMessage: string;
  onSelect: (pageId: string) => void;
  onAddPage?: () => void;
};

export function PageNavigation({
  ariaLabel,
  pages,
  selectedPageId,
  emptyMessage,
  onSelect,
  onAddPage,
}: PageNavigationProps) {
  return <aside aria-label={ariaLabel} className="rounded-lg border border-border bg-white p-3">
    {pages.length ? <nav aria-label="Pages" className="grid gap-2">
      {pages.map((page, index) => {
        const selected = page.id === selectedPageId;
        return <button
          key={page.id}
          type="button"
          aria-current={selected ? "page" : undefined}
          onClick={() => onSelect(page.id)}
          className={`grid min-h-16 w-full gap-1 rounded-md border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 ${selected ? "border-text-muted/30 bg-surface-muted" : "border-border bg-white hover:bg-surface-muted"}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">PAGE {index + 1}</span>
          <span className="min-w-0 break-words text-sm font-semibold text-text-primary" title={page.title}>{page.title}</span>
        </button>;
      })}
    </nav> : <p className="px-2 py-2 text-sm text-text-muted">{emptyMessage}</p>}
    {onAddPage ? <button type="button" onClick={onAddPage} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50"><Plus className="size-4" aria-hidden="true" />Add Page</button> : null}
  </aside>;
}
