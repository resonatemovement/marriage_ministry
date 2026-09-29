import { requireOneOfRoles } from "@/lib/auth/session";
import { authoringWorkspaceFor } from "@/features/session-builder/access";

export const RESOURCE_LIBRARY_ROLES = ["super_admin", "admin", "author"] as const;

export async function requireResourceLibraryAccess(path: string) {
  const identity = await requireOneOfRoles(RESOURCE_LIBRARY_ROLES, path);
  return { identity, workspace: authoringWorkspaceFor(identity) };
}
