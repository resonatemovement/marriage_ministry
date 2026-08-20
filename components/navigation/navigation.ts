import {
  BookOpenText,
  HeartHandshake,
  LayoutDashboard,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: boolean;
  children?: readonly NavigationItem[];
}

export const navigationItems: readonly NavigationItem[] = [
  { label: "Overview", href: "#overview", icon: LayoutDashboard, active: true },
  { label: "Counseling Cases", href: "#workflow", icon: HeartHandshake },
  { label: "People & Teams", href: "/people", icon: Users },
  { label: "Campuses", href: "#campuses", icon: ShieldCheck },
  { label: "Content", href: "#content", icon: BookOpenText },
];
