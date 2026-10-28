import type { ReactNode } from "react";

import type { WorkspaceId } from "@/lib/workspaces";
import type { AuthenticatedIdentity } from "@/lib/auth/session";
import { getWorkspaceDefinition } from "@/lib/workspaces";

import { AppSidebar } from "./app-sidebar";
import { MobileAppHeader } from "./mobile-app-header";
import { workspaceNavigation } from "./navigation";
import { getInAppNotifications } from "@/features/notifications/in-app-queries";
import { InAppNotificationMenu } from "@/features/notifications/in-app-notification-menu";
import { InAppNotificationRealtime } from "@/features/notifications/in-app-notification-realtime";

export async function WorkspaceShell({
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
  const notifications = workspace === "couple" ? await getInAppNotifications(identity.id) : null;

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar activeHref={activeHref} items={items} displayName={identity.displayName} workspaceLabel={getWorkspaceDefinition(workspace).label} workspaces={identity.workspaces} activeWorkspace={workspace} />
      <div className="lg:pl-64">
        <MobileAppHeader activeHref={activeHref} workspace={workspace} displayName={identity.displayName} workspaceLabel={getWorkspaceDefinition(workspace).label} workspaces={identity.workspaces} activeWorkspace={workspace} />
        {notifications ? <><InAppNotificationRealtime profileId={identity.id} /><div className="mx-auto max-w-[1100px] px-5 pt-4 sm:px-8 lg:px-10"><InAppNotificationMenu key={notifications.map(({ id, read_at }) => `${id}:${read_at ?? ""}`).join("|")} notifications={notifications} /></div></> : null}
        {children}
      </div>
    </div>
  );
}
