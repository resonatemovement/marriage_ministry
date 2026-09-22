"use client";

import { Toaster } from "sonner";

export function ToastProvider() {
  return <Toaster position="bottom-right" closeButton richColors duration={4000} toastOptions={{ classNames: { toast: "font-sans", success: "border-success bg-success-soft text-success-strong", error: "border-danger bg-danger-soft text-danger-strong", warning: "border-warning bg-warning-soft text-warning-strong", info: "border-info bg-info-soft text-info-strong" } }} />;
}
