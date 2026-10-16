"use client";

import { CircleAlert, Check } from "lucide-react";
import { Toaster } from "sonner";
import type { ComponentProps } from "react";

export const toastProviderOptions = {
  position: "bottom-right",
  theme: "system",
  closeButton: true,
  richColors: true,
  duration: 4000,
  offset: 24,
  mobileOffset: { bottom: 16, left: 16, right: 16 },
  icons: {
    success: <Check aria-hidden="true" className="size-4" />,
    error: <CircleAlert aria-hidden="true" className="size-4" />,
  },
  toastOptions: {
    closeButtonAriaLabel: "Dismiss notification",
    classNames: {
      toast: "rounded-lg border px-4 py-3 font-sans shadow-md",
      success: "border-success bg-success-soft text-success-strong",
      error: "border-danger bg-danger-soft text-danger-strong",
      warning: "border-warning bg-warning-soft text-warning-strong",
      info: "border-info bg-info-soft text-info-strong",
    },
  },
} satisfies ComponentProps<typeof Toaster>;

export function ToastProvider() {
  return <Toaster {...toastProviderOptions} />;
}
