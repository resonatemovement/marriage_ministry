"use client";

import { useRef, useState } from "react";
import { Download, Eye } from "lucide-react";

import { filenameFromContentDisposition } from "./model";
import { showErrorToast } from "@/lib/toast";

export function ExportSessionMaterialsButton({ caseSessionId, className }: { caseSessionId: string; className?: string }) {
  const [pending, setPending] = useState<"preview" | "download" | null>(null);
  const lock = useRef(false);

  async function exportPdf(mode: "preview" | "download") {
    if (lock.current) return;
    const popup = mode === "preview" ? window.open("about:blank", "_blank") : null;
    if (mode === "preview" && !popup) { showErrorToast("Allow pop-ups to open the Session Materials PDF."); return; }
    if (popup) {
      popup.opener = null;
      popup.document.title = "Preparing Session Materials PDF";
      popup.document.body.textContent = "Preparing your Session Materials PDF…";
    }
    lock.current = true;
    setPending(mode);
    let objectUrl: string | null = null;
    try {
      const query = mode === "download" ? "?download=1" : "";
      const response = await fetch(`/api/case-sessions/${encodeURIComponent(caseSessionId)}/materials-pdf${query}`, { cache: "no-store" });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error("Export failed");
      const filename = mode === "download" ? filenameFromContentDisposition(response.headers.get("content-disposition")) : null;
      if (mode === "download" && !filename) throw new Error("Missing PDF filename");
      const blob = await response.blob();
      if (!blob.size) throw new Error("Empty PDF");
      objectUrl = URL.createObjectURL(blob);
      if (mode === "preview") {
        if (!popup) throw new Error("Missing preview tab");
        popup.location.replace(objectUrl);
      } else {
        if (!filename) throw new Error("Missing PDF filename");
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        link.hidden = true;
        document.body.append(link);
        link.click();
        link.remove();
      }
      const downloadUrl = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      objectUrl = null;
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      popup?.close();
      showErrorToast("Session Materials PDF could not be prepared. Please try again.");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return <div aria-busy={pending !== null} className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
    <button type="button" data-pdf-action="preview" onClick={() => exportPdf("preview")} disabled={pending !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
      <Eye className="size-4" aria-hidden="true" />{pending === "preview" ? "Preparing PDF…" : "Preview PDF"}
    </button>
    <button type="button" data-pdf-action="download" onClick={() => exportPdf("download")} disabled={pending !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90 focus-visible:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60">
      <Download className="size-4" aria-hidden="true" />{pending === "download" ? "Preparing PDF…" : "Download PDF"}
    </button>
  </div>;
}
