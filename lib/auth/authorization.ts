import { getWorkspaceDefinition, type WorkspaceId } from "../workspaces";
import { WORKSPACE_HREF } from "../workspaces";

const workspaceByPath: Readonly<Record<string, WorkspaceId>> = {
  "/people": "admin",
  "/intake-requests": "admin",
};

export function workspaceForPath(path: string | undefined) {
  if (!path?.startsWith("/")) return undefined;

  const pathname = new URL(path, "https://resonate.local").pathname;
  return workspaceByPath[pathname];
}

export function defaultWorkspaceDestination(workspaces: readonly WorkspaceId[]) {
  return workspaces[0] ? getWorkspaceDefinition(workspaces[0]).href : undefined;
}

export function postLoginDestination(workspaces: readonly WorkspaceId[], next: string | undefined) {
  const pathname = next?.startsWith("/") ? new URL(next, "https://resonate.local").pathname : undefined;
  if (pathname === "/dashboard" && (workspaces.includes("admin") || workspaces.includes("campus_lead"))) return next!;
  const requestedWorkspace = workspaceForPath(next);
  if (requestedWorkspace && workspaces.includes(requestedWorkspace)) return next!;

  return defaultWorkspaceDestination(workspaces);
}

export function loginDestination(next: string) {
  if (next === WORKSPACE_HREF) return "/login";

  return `/login?next=${encodeURIComponent(next)}`;
}
