import type { ReactNode } from "react";

import type { WorkspaceId } from "@/lib/workspaces";

import { AppSidebar } from "./app-sidebar";
import { MobileAppHeader } from "./mobile-app-header";
import { workspaceNavigation } from "./navigation";

export function WorkspaceShell({
  workspace,
  activeHref,
  children,
}: {
  workspace: WorkspaceId;
  activeHref: string;
  children: ReactNode;
}) {
  const items = workspaceNavigation[workspace];

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar activeHref={activeHref} items={items} />
      <div className="lg:pl-64">
        <MobileAppHeader activeHref={activeHref} workspace={workspace} />
        {children}
      </div>
    </div>
  );
}
