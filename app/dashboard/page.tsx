import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { requireOneOfWorkspaces } from "@/lib/auth/session";

export default async function SharedDashboardRoute() {
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], "/dashboard");
  const workspace = identity.roles.includes("admin") || identity.roles.includes("super_admin") ? "admin" : "campus_lead";
  return <WorkspaceShell workspace={workspace} activeHref="/dashboard" identity={identity}><DashboardPage identity={identity} /></WorkspaceShell>;
}
