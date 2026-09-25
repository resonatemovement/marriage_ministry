"use client";

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { focusFirstDialogTextField } from "./dialog-focus";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogOverlay = ({ className = "", ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) => <AlertDialogPrimitive.Overlay {...props} className={`fixed inset-0 z-50 bg-black/50 ${className}`} />;
export const AlertDialogContent = ({ className = "", onOpenAutoFocus, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <AlertDialogPrimitive.Content {...props} onOpenAutoFocus={(event) => { onOpenAutoFocus?.(event); if (!event.defaultPrevented) focusFirstDialogTextField(event); }} className={`fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-xl bg-background p-6 shadow-xl sm:left-1/2 sm:right-auto sm:w-[min(440px,calc(100vw-2rem))] sm:-translate-x-1/2 ${className}`} />
  </AlertDialogPrimitive.Portal>
);
export const AlertDialogHeader = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props} className={`grid gap-2 ${className}`} />;
export const AlertDialogFooter = ({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props} className={`mt-6 flex justify-end gap-2 ${className}`} />;
export const AlertDialogTitle = ({ className = "", ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) => <AlertDialogPrimitive.Title {...props} className={`font-heading text-lg font-bold text-text-primary ${className}`} />;
export const AlertDialogDescription = ({ className = "", ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) => <AlertDialogPrimitive.Description {...props} className={`text-sm text-text-muted ${className}`} />;
export const AlertDialogCancel = ({ className = "", ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) => <AlertDialogPrimitive.Cancel {...props} className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted ${className}`} />;
export const AlertDialogAction = ({ className = "", ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Action>) => <AlertDialogPrimitive.Action {...props} className={`min-h-10 rounded-md bg-danger-strong px-4 py-2 text-sm font-semibold text-white ${className}`} />;
