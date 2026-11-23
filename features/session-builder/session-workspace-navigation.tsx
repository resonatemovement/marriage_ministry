"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SegmentedNavigation, segmentedNavigationItemClassName } from "@/components/ui/segmented-navigation";
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

  return <SegmentedNavigation label="Session authoring workspaces" className="mb-6">
    <button type="button" aria-current={activeWorkspace === "material" ? "page" : undefined} onClick={() => selectWorkspace("material")} className={segmentedNavigationItemClassName(activeWorkspace === "material")}>
      Session Material
    </button>
    <button type="button" disabled={isPending && pendingWorkspace !== "homework"} aria-current={activeWorkspace === "homework" ? "page" : undefined} onClick={() => selectWorkspace("homework")} className={`${segmentedNavigationItemClassName(activeWorkspace === "homework")} disabled:cursor-wait`}>
      Homework
    </button>
    {isPending ? <span className="sr-only" role="status">Loading {pendingWorkspace === "homework" ? "Homework" : "Session Material"}</span> : null}
  </SegmentedNavigation>;
}
