export type SessionWorkspace = "material" | "homework";

export function sessionPreviewTabForWorkspace(workspace: SessionWorkspace) {
  return workspace === "homework" ? "homework" : "material";
}

export function sessionWorkspaceFromSearch(value: string | undefined): SessionWorkspace {
  return value === "homework" ? "homework" : "material";
}

export function sessionWorkspaceHref(sessionId: string, workspace: SessionWorkspace) {
  const base = `/session-builder/${sessionId}`;
  return workspace === "homework" ? `${base}?workspace=homework` : base;
}

export function sessionNavigationRequest(sessionId: string, currentSessionId: string, workspace: SessionWorkspace, hasUnsavedChanges: boolean) {
  if (sessionId === currentSessionId) return { destination: null, requiresConfirmation: false };
  return { destination: sessionWorkspaceHref(sessionId, workspace), requiresConfirmation: hasUnsavedChanges };
}
