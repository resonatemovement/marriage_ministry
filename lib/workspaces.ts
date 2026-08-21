import type { AppRole } from "@/lib/counseling/domain";

export const WORKSPACE_IDS = [
  "admin",
  "coach",
  "counselor",
  "author",
  "couple",
] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  href: string;
  placeholderMessage?: string;
}

const workspaceDefinitions: Readonly<Record<WorkspaceId, WorkspaceDefinition>> = {
  admin: { id: "admin", label: "Admin Workspace", href: "/" },
  coach: { id: "coach", label: "Coach Workspace", href: "/coach", placeholderMessage: "Your counseling dashboard will appear here." },
  counselor: { id: "counselor", label: "Counselor Workspace", href: "/counselor", placeholderMessage: "Your counseling dashboard will appear here." },
  author: { id: "author", label: "Author Workspace", href: "/author", placeholderMessage: "Your counseling content workspace will appear here." },
  couple: { id: "couple", label: "Couple Workspace", href: "/couple", placeholderMessage: "Your counseling journey will appear here." },
};

const workspaceByRole: Readonly<Record<AppRole, WorkspaceId>> = {
  super_admin: "admin",
  admin: "admin",
  coach: "coach",
  counselor: "counselor",
  couple: "couple",
  author: "author",
};

export function getWorkspaceDefinition(workspace: WorkspaceId) {
  return workspaceDefinitions[workspace];
}

export function availableWorkspacesForRoles(roles: readonly AppRole[]) {
  const permittedWorkspaces = new Set(roles.map((role) => workspaceByRole[role]));
  return WORKSPACE_IDS.filter((workspace) => permittedWorkspaces.has(workspace)).map(
    getWorkspaceDefinition,
  );
}

export function defaultWorkspaceForRoles(roles: readonly AppRole[]) {
  return availableWorkspacesForRoles(roles)[0];
}
