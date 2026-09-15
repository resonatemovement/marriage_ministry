import type { AppRole } from "@/lib/counseling/domain";

export const WORKSPACE_IDS = [
  "admin",
  "campus_lead",
  "coach",
  "counselor",
  "author",
  "couple",
] as const;

export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export const WORKSPACE_HREF = "/workspace";

interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  href: string;
  placeholderMessage?: string;
}

const workspaceDefinitions: Readonly<Record<WorkspaceId, WorkspaceDefinition>> = {
  admin: { id: "admin", label: "Admin Workspace", href: WORKSPACE_HREF },
  campus_lead: { id: "campus_lead", label: "Campus Lead Workspace", href: WORKSPACE_HREF, placeholderMessage: "Your campus overview will appear here." },
  coach: { id: "coach", label: "Coach Workspace", href: WORKSPACE_HREF, placeholderMessage: "Your counseling dashboard will appear here." },
  counselor: { id: "counselor", label: "Counselor Workspace", href: WORKSPACE_HREF, placeholderMessage: "Your counseling dashboard will appear here." },
  author: { id: "author", label: "Author Workspace", href: WORKSPACE_HREF, placeholderMessage: "Your counseling content workspace will appear here." },
  couple: { id: "couple", label: "Couple Workspace", href: WORKSPACE_HREF, placeholderMessage: "Your counseling journey will appear here." },
};

const workspaceByRole: Readonly<Record<AppRole, WorkspaceId>> = {
  super_admin: "admin",
  admin: "admin",
  campus_lead: "campus_lead",
  coach: "coach",
  counselor: "counselor",
  couple: "couple",
  author: "author",
};

const operationalWorkspaceOrder = ["campus_lead", "coach", "counselor", "author", "couple"] as const;

export function isWorkspaceId(value: string): value is WorkspaceId {
  return WORKSPACE_IDS.includes(value as WorkspaceId);
}

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
  const available = availableWorkspacesForRoles(roles);

  if (roles.includes("admin")) {
    return available.find((workspace) => workspace.id === "admin");
  }

  if (roles.includes("super_admin")) {
    const operationalWorkspace = operationalWorkspaceOrder.find((workspaceId) =>
      available.some((workspace) => workspace.id === workspaceId),
    );

    return operationalWorkspace
      ? getWorkspaceDefinition(operationalWorkspace)
      : available.find((workspace) => workspace.id === "admin");
  }

  return available[0];
}
