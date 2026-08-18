import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-black/[0.04] bg-surface shadow-[0_1px_2px_rgba(43,45,42,0.04),0_8px_24px_rgba(43,45,42,0.035)]", className)}
      {...props}
    />
  );
}
