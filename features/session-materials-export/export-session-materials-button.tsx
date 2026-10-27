"use client";

import { useRef, useState } from "react";

import { showErrorToast } from "@/lib/toast";

export function ExportSessionMaterialsButton({ caseSessionId, className }: { caseSessionId: string; className?: string }) {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  async function exportPdf() {
    if (lock.current) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) { showErrorToast("Allow pop-ups to open the Session Materials PDF."); return; }
    popup.opener = null;
    popup.document.title = "Preparing Session Materials PDF";
    popup.document.body.textContent = "Preparing your Session Materials PDF…";
    lock.current = true;
    setPending(true);
    try {
      const response = await fetch(`/api/case-sessions/${encodeURIComponent(caseSessionId)}/materials-pdf`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Export failed");
      const blob = await response.blob();
      if (!blob.size) throw new Error("Empty PDF");
      const url = URL.createObjectURL(blob);
      popup.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      popup.close();
      showErrorToast("Session Materials PDF could not be prepared. Please try again.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return <button type="button" onClick={exportPdf} disabled={pending} className={`inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-primary disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}>
    {pending ? "Preparing PDF…" : "Export PDF"}
  </button>;
}
