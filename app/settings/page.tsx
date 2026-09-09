import { Settings } from "lucide-react";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireWorkspace } from "@/lib/auth/session";
import { getWorkspaceDefinition } from "@/lib/workspaces";

import { CampusSettings } from "@/features/settings/campus-settings";
import { getCampusList } from "@/features/settings/campus-queries";

export default async function SettingsPage() {
  const identity = await requireWorkspace("admin", "/settings");
  const campuses = await getCampusList();
  return <WorkspaceShell workspace="admin" activeHref="/settings" identity={identity}><main className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10"><div className="flex items-start gap-4"><div className="grid size-12 place-items-center rounded-lg bg-sidebar-accent text-sidebar-active"><Settings className="size-6" aria-hidden="true" /></div><div><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">{getWorkspaceDefinition("admin").label}</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Settings</h1><p className="mt-2 text-sm text-text-muted">Manage workspace lookups used across Resonate.</p></div></div><CampusSettings initialCampuses={campuses} /></main></WorkspaceShell>;
}
