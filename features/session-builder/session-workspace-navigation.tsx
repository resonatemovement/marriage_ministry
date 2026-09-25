"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sessionWorkspaceHref, type SessionWorkspace } from "./workspace";

export function SessionWorkspaceNavigation({ sessionId, activeWorkspace }: {
  sessionId: string;
  activeWorkspace: SessionWorkspace;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingWorkspace, setPendingWorkspace] = useState<SessionWorkspace | null>(null);

  function selectWorkspace(workspace: SessionWorkspace) {
    if (workspace === activeWorkspace || isPending) return;
    setPendingWorkspace(workspace);
    startTransition(() => router.push(sessionWorkspaceHref(sessionId, workspace), { scroll: false }));
  }

  return <nav aria-label="Session authoring workspaces" className="mb-6 flex gap-2 border-b border-border">
    <button type="button" aria-current={activeWorkspace === "material" ? "page" : undefined} onClick={() => selectWorkspace("material")} className={`min-h-10 border-b-2 px-4 py-2 text-sm font-semibold transition focus-visible:bg-sidebar-accent focus-visible:text-brand-primary ${activeWorkspace === "material" ? "border-brand-primary text-brand-primary" : "border-transparent text-text-muted hover:text-text-primary"}`}>
      Session Material
    </button>
    <button type="button" disabled={isPending && pendingWorkspace !== "homework"} aria-current={activeWorkspace === "homework" ? "page" : undefined} onClick={() => selectWorkspace("homework")} className={`min-h-10 border-b-2 px-4 py-2 text-sm font-semibold transition focus-visible:bg-sidebar-accent focus-visible:text-brand-primary disabled:cursor-wait ${activeWorkspace === "homework" ? "border-brand-primary text-brand-primary" : "border-transparent text-text-muted hover:text-text-primary"}`}>
      Homework
    </button>
    {isPending ? <span className="sr-only" role="status">Loading {pendingWorkspace === "homework" ? "Homework" : "Session Material"}</span> : null}
  </nav>;
}
