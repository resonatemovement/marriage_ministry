import "server-only";

import { cookies } from "next/headers";

import type { WorkspaceId } from "@/lib/workspaces";
import { resolveActiveWorkspace } from "@/lib/workspace-selection";

const ACTIVE_WORKSPACE_COOKIE = "resonate-active-workspace";

const activeWorkspaceCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function getActiveWorkspace(
  workspaces: readonly WorkspaceId[],
  fallbackWorkspace: WorkspaceId,
) {
  const cookieStore = await cookies();
  return resolveActiveWorkspace(
    workspaces,
    cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value,
    fallbackWorkspace,
  );
}

export async function setActiveWorkspace(workspace: WorkspaceId) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspace, activeWorkspaceCookieOptions);
}

export async function clearActiveWorkspace() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
}
