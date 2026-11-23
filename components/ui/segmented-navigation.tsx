import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const segmentedNavigationTrackClassName = "inline-flex h-10 items-center rounded-md bg-surface-muted p-1";
const segmentedNavigationItemBaseClassName = "rounded-sm whitespace-nowrap px-3 py-1.5 text-sm text-text-muted transition-colors hover:text-text-primary focus-visible:bg-white focus-visible:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-muted focus-visible:outline-none";
const segmentedNavigationItemActiveClassName = "bg-white font-semibold text-text-primary";

export function segmentedNavigationItemClassName(active: boolean) {
  return cn(segmentedNavigationItemBaseClassName, active && segmentedNavigationItemActiveClassName);
}

export function SegmentedNavigation({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <nav aria-label={label} className={cn("min-w-0 overflow-x-auto pb-1", className)}>
    <div className={cn(segmentedNavigationTrackClassName, "min-w-max")}>{children}</div>
  </nav>;
}
