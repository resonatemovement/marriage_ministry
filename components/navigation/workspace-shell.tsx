import type { ReactNode } from "react";

import type { WorkspaceId } from "@/lib/workspaces";
import type { AuthenticatedIdentity } from "@/lib/auth/session";
import { getWorkspaceDefinition } from "@/lib/workspaces";

import { AppSidebar } from "./app-sidebar";
import { MobileAppHeader } from "./mobile-app-header";
import { workspaceNavigation } from "./navigation";

export function WorkspaceShell({
  workspace,
  activeHref,
  identity,
  children,
}: {
  workspace: WorkspaceId;
  activeHref: string;
  identity: AuthenticatedIdentity;
  children: ReactNode;
}) {
  const items = workspaceNavigation[workspace];

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar activeHref={activeHref} items={items} displayName={identity.displayName} workspaceLabel={getWorkspaceDefinition(workspace).label} workspaces={identity.workspaces} activeWorkspace={workspace} />
      <div className="lg:pl-64">
        <MobileAppHeader activeHref={activeHref} workspace={workspace} displayName={identity.displayName} workspaceLabel={getWorkspaceDefinition(workspace).label} workspaces={identity.workspaces} activeWorkspace={workspace} />
        {children}
      </div>
    </div>
  );
}
