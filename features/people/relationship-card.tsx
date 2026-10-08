"use client";

import Link from "next/link";
import { cloneElement, isValidElement, useState, type ReactNode } from "react";
import { ChevronRight, Eye, MoreVertical } from "lucide-react";

import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface RelationshipRow { id: string; name: string; metadata: string; href: string; action?: ReactNode; }

export function RelationshipCard({ title, rows, empty, footer, navigationMode = "menu" }: { title: string; rows: RelationshipRow[]; empty: string; footer?: ReactNode; navigationMode?: "menu" | "chevron" }) {
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const action = (row: RelationshipRow, menuOnly: boolean) => isValidElement(row.action) ? cloneElement(row.action, { open: openRowId === row.id, onOpenChange: (open: boolean) => setOpenRowId(open ? row.id : null), menuOnly } as Record<string, unknown>) : row.action;

  return <Card className="p-4">
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-base font-semibold text-text-primary">{title}</h2>
        <span className="text-sm font-medium text-text-muted">{rows.length}</span>
      </div>
      <div className={navigationMode === "chevron" ? "-mx-4 -mb-4 mt-3 max-h-[13rem] overflow-y-auto divide-y divide-border" : "mt-3 max-h-[12rem] overflow-y-auto divide-y divide-border"}>
        {rows.length ? rows.map((row) => {
          const contents = <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{row.name}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{row.metadata}</p>
            </div>
            {navigationMode === "chevron" ? <ChevronRight className="size-4 shrink-0 text-text-muted transition-colors group-hover:text-text-primary group-focus-visible:text-brand-primary" aria-hidden="true" /> : <>
              <DropdownMenu>
                <DropdownMenuTrigger aria-label={`More actions for ${row.name}`} className="grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted hover:text-text-primary focus:outline-none focus:bg-surface-muted">
                  <MoreVertical className="size-4" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={row.href}><Eye className="size-4" aria-hidden="true" />View Details</Link>
                  </DropdownMenuItem>
                  {action(row, true)}
                </DropdownMenuContent>
              </DropdownMenu>
              {action(row, false)}
            </>}
          </>;

          return navigationMode === "chevron" ? <Link key={row.id} href={row.href} aria-label={`View details for ${row.name}`} className="group block h-[4rem] w-full px-4 text-left transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none last:h-[5rem]"><span className="flex h-[4rem] items-center gap-3">{contents}</span></Link> : <div key={row.id} className="flex h-[4rem] items-center gap-3">{contents}</div>;
        }) : <p className="py-1 text-sm text-text-muted">{empty}</p>}
      </div>
      {footer ? <div className="mt-4 border-t border-border pt-3">{footer}</div> : null}
    </section>
  </Card>;
}
