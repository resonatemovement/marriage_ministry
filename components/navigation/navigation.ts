import {
  BookOpenText,
  HeartHandshake,
  LayoutDashboard,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { WorkspaceId } from "@/lib/workspaces";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: readonly NavigationItem[];
}

export const workspaceNavigation: Readonly<Record<WorkspaceId, readonly NavigationItem[]>> = {
  admin: [
    { label: "Workspace", href: "/", icon: LayoutDashboard },
    { label: "Counseling Cases", href: "#workflow", icon: HeartHandshake },
    { label: "People & Teams", href: "/people", icon: Users },
    { label: "Campuses", href: "#campuses", icon: ShieldCheck },
    { label: "Content", href: "#content", icon: BookOpenText },
  ],
  coach: [{ label: "Workspace", href: "/coach", icon: LayoutDashboard }],
  counselor: [{ label: "Workspace", href: "/counselor", icon: LayoutDashboard }],
  author: [{ label: "Workspace", href: "/author", icon: LayoutDashboard }],
  couple: [{ label: "Workspace", href: "/couple", icon: LayoutDashboard }],
};
