import { Bell, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export function GlobalActions({ className }: { className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <button
        type="button"
        title="Search"
        aria-label="Search"
        className="grid size-9 place-items-center rounded-md bg-surface-muted text-text-muted transition hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        <Search className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        title="Notifications"
        aria-label="Notifications"
        className="relative grid size-9 place-items-center rounded-md bg-surface-muted text-text-muted transition hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        <Bell className="size-4" aria-hidden="true" />
        <span className="absolute right-2 top-2 size-1.5 rounded-full bg-brand-accent" />
      </button>
    </div>
  );
}
