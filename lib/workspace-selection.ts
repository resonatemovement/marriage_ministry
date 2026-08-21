import { isWorkspaceId, type WorkspaceId } from "./workspaces";

export function resolveActiveWorkspace(
  workspaces: readonly WorkspaceId[],
  requestedWorkspace: string | undefined,
  fallbackWorkspace = workspaces[0],
) {
  if (requestedWorkspace && isWorkspaceId(requestedWorkspace) && workspaces.includes(requestedWorkspace)) {
    return requestedWorkspace;
  }

  return fallbackWorkspace && workspaces.includes(fallbackWorkspace)
    ? fallbackWorkspace
    : workspaces[0];
}
