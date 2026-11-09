import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { TeamAvailabilityList } from "@/features/dashboard/team-availability-list";
import { normalizeTeamAvailabilityView } from "@/features/dashboard/team-availability";
import { getDashboardTeamAvailability } from "@/features/dashboard/team-availability-queries";
import { requireOneOfWorkspaces } from "@/lib/auth/session";

export default async function DashboardTeamAvailabilityRoute({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], "/dashboard/team-availability");
  const workspace = identity.roles.includes("admin") || identity.roles.includes("super_admin") ? "admin" : "campus_lead";
  const params = await searchParams;
  const view = normalizeTeamAvailabilityView(params.view);
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const result = await getDashboardTeamAvailability();

  return <WorkspaceShell workspace={workspace} activeHref="/dashboard" identity={identity}>
    <TeamAvailabilityList teams={result.error ? null : result.teams} view={view} search={search} error={result.error !== null} />
  </WorkspaceShell>;
}
