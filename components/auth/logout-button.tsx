"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";

import { signOut } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export function LogoutButton({
  className,
  variant = "button",
}: {
  className?: string;
  variant?: "button" | "menu-item";
}) {
  const [isPending, startTransition] = useTransition();

  if (variant === "menu-item") {
    return (
      <DropdownMenuItem
        disabled={isPending}
        onSelect={() => startTransition(() => signOut())}
        variant="destructive"
        className={className}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {isPending ? "Signing out..." : "Log out"}
      </DropdownMenuItem>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-muted transition hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-70",
        className,
      )}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
