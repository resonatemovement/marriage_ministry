import type { AuthenticatedIdentity } from "@/lib/auth/session";
import { requireOneOfRoles } from "@/lib/auth/session";
import type { WorkspaceId } from "@/lib/workspaces";

const SESSION_BUILDER_ROLES = ["super_admin", "admin", "author"] as const;

export async function requireSessionBuilderAccess(path: string) {
  const identity = await requireOneOfRoles(SESSION_BUILDER_ROLES, path);
  return { identity, workspace: authoringWorkspaceFor(identity) };
}

export function authoringWorkspaceFor(identity: AuthenticatedIdentity): WorkspaceId {
  return identity.roles.includes("super_admin") || identity.roles.includes("admin") ? "admin" : "author";
}
