"use client";

import { Menu } from "lucide-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { GlobalActions } from "@/components/shared/global-actions";

import { type NavigationItem, navigationItems } from "./navigation";
import { ResonateBrand } from "./resonate-brand";

function MobileNavigationList({
  items,
  nested = false,
}: {
  items: readonly NavigationItem[];
  nested?: boolean;
}) {
  return (
    <ul
      className={cn(
        "space-y-1",
        nested && "ml-7 mt-1 border-l border-sidebar-border pl-3",
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <SheetClose asChild>
              <a
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
                  item.active
                    ? "bg-sidebar-accent font-bold text-sidebar-active"
                    : "text-sidebar-muted hover:bg-surface-muted hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </a>
            </SheetClose>
            {item.children?.length ? (
              <MobileNavigationList items={item.children} nested />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function MobileAppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 lg:hidden">
      <ResonateBrand />
      <div className="flex shrink-0 items-center gap-2">
        <GlobalActions />
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              title="Open navigation"
              aria-label="Open navigation"
              className="grid size-9 place-items-center rounded-md bg-surface-muted text-text-muted transition hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              <Menu className="size-4" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(20rem,88vw)] gap-0 border-sidebar-border bg-sidebar p-0"
          >
            <SheetHeader className="border-b border-sidebar-border px-5 py-5 text-left">
              <ResonateBrand />
              <SheetTitle className="sr-only">Primary navigation</SheetTitle>
              <SheetDescription className="sr-only">
                Navigate the marriage ministry administration workspace.
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile primary" className="overflow-y-auto px-4 py-5">
              <MobileNavigationList items={navigationItems} />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
