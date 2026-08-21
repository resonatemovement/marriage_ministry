"use client";

import { ChevronDown, Settings } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function initials(displayName: string) {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AccountMenu({
  displayName,
  workspaceLabel,
  className,
}: {
  displayName: string;
  workspaceLabel: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open account menu for ${displayName}`}
          className={cn(
            "flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left transition hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
            className,
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-primary text-xs font-bold text-white">
            {initials(displayName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-sidebar-foreground">{displayName}</span>
            <span className="block truncate text-xs text-sidebar-muted">{workspaceLabel}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-sidebar-muted" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <LogoutButton variant="menu-item" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
