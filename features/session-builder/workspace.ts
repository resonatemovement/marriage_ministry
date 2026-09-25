export type SessionWorkspace = "material" | "homework";

export function sessionWorkspaceFromSearch(value: string | undefined): SessionWorkspace {
  return value === "homework" ? "homework" : "material";
}

export function sessionWorkspaceHref(sessionId: string, workspace: SessionWorkspace) {
  const base = `/session-builder/${sessionId}`;
  return workspace === "homework" ? `${base}?workspace=homework` : base;
}
