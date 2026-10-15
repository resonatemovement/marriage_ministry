import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input
    data-slot="input"
    type={type}
    className={cn("min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-brand-secondary disabled:cursor-not-allowed disabled:opacity-60", className)}
    {...props}
  />;
}
