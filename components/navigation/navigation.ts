import {
  BookOpenText,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { WORKSPACE_HREF, type WorkspaceId } from "@/lib/workspaces";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: readonly NavigationItem[];
}

export const workspaceNavigation: Readonly<Record<WorkspaceId, readonly NavigationItem[]>> = {
  admin: [
    { label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard },
    { label: "People & Teams", href: "/people", icon: Users },
    { label: "Intake Requests", href: "/intake-requests", icon: ClipboardList },
    { label: "Session Builder", href: "/session-builder", icon: BookOpenText },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "My Profile", href: "/profile", icon: UserRound },
  ],
  campus_lead: [
    { label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard },
    { label: "People & Teams", href: "/people", icon: Users },
    { label: "Intake Requests", href: "/intake-requests", icon: ClipboardList },
    { label: "My Profile", href: "/profile", icon: UserRound },
  ],
  coach: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }, { label: "My Profile", href: "/profile", icon: UserRound }],
  counselor: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }, { label: "My Profile", href: "/profile", icon: UserRound }],
  author: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }, { label: "Session Builder", href: "/session-builder", icon: BookOpenText }, { label: "My Profile", href: "/profile", icon: UserRound }],
  couple: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }, { label: "My Profile", href: "/profile", icon: UserRound }],
};
