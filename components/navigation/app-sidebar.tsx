import { AccountMenu } from "@/components/auth/account-menu";

import { type NavigationItem, workspaceNavigation } from "./navigation";
import { ResonateBrand } from "./resonate-brand";

export function AppSidebar({ activeHref = "/", items = workspaceNavigation.admin, displayName, workspaceLabel }: { activeHref?: string; items?: readonly NavigationItem[]; displayName: string; workspaceLabel: string }) {
  return (
    <aside className="hidden border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:block lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex h-18 items-center gap-3 px-5 lg:h-24 lg:px-7">
        <ResonateBrand />
      </div>

      <nav aria-label="Primary" className="grid grid-cols-5 gap-1 px-3 pb-3 sm:flex sm:overflow-x-auto lg:block lg:px-4 lg:py-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.label}
              href={item.href}
              aria-current={item.href === activeHref ? "page" : undefined}
              className={
                item.href === activeHref
                  ? "flex h-11 min-w-0 shrink-0 items-center justify-center gap-3 rounded-md bg-sidebar-accent px-3 text-sm font-bold text-sidebar-active sm:justify-start"
                  : "flex h-11 min-w-0 shrink-0 items-center justify-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-muted transition hover:bg-surface-muted hover:text-sidebar-foreground sm:justify-start"
              }
              title={item.label}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="hidden border-t border-sidebar-border p-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
        <AccountMenu displayName={displayName} workspaceLabel={workspaceLabel} />
      </div>
    </aside>
  );
}
