import {
  BookOpenText,
  ClipboardList,
  HeartHandshake,
  LayoutDashboard,
  Settings,
  Users,
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
    { label: "Counseling Cases", href: "#workflow", icon: HeartHandshake },
    { label: "People & Teams", href: "/people", icon: Users },
    { label: "Intake Requests", href: "/intake-requests", icon: ClipboardList },
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Content", href: "#content", icon: BookOpenText },
  ],
  coach: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }],
  counselor: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }],
  author: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }],
  couple: [{ label: "Workspace", href: WORKSPACE_HREF, icon: LayoutDashboard }],
};
