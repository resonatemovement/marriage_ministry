"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({ className, align = "center", sideOffset = 4, collisionPadding = 16, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return <PopoverPrimitive.Portal><PopoverPrimitive.Content data-slot="popover-content" align={align} sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn("z-50 rounded-md border border-border bg-surface text-text-primary shadow-[0_8px_24px_rgba(43,45,42,0.14)] outline-none", className)} {...props} /></PopoverPrimitive.Portal>;
}

export { Popover, PopoverContent, PopoverTrigger };
