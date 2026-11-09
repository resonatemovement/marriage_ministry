import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { AssignmentQueuePanel } from "@/components/dashboard/assignment-queue-panel";
import { TeamAvailabilityCarousel } from "@/components/dashboard/team-availability-carousel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { UpcomingPanel } from "@/components/dashboard/upcoming-panel";
import { WorkflowPanel } from "@/components/dashboard/workflow-panel";
import { dashboardMetrics, dashboardWorkflow } from "@/features/dashboard/data";
import { filterDashboardAvailabilityTeams } from "@/features/dashboard/team-availability";
import { getDashboardAttentionItems, getAdminDashboardCounts, getCampusLeadDashboardCounts } from "@/features/dashboard/queries";
import { getDashboardTeamAvailability } from "@/features/dashboard/team-availability-queries";
import type { AuthenticatedIdentity } from "@/lib/auth/session";

export async function DashboardPage({ identity }: { identity: AuthenticatedIdentity }) {
  const isAdmin = identity.roles.includes("admin") || identity.roles.includes("super_admin");
  const [countsResult, attentionResult, teamAvailabilityResult] = await Promise.all([
    isAdmin ? getAdminDashboardCounts() : getCampusLeadDashboardCounts(),
    getDashboardAttentionItems(identity),
    getDashboardTeamAvailability(),
  ]);
  const counts = countsResult.error ? null : countsResult.counts;
  const metrics = dashboardMetrics(counts, isAdmin, "/intake-requests?status=under_review");

  return <>
    <DashboardHeader scope={isAdmin ? "ministry" : "campus"} />
    <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
      <p className="sr-only" aria-label={isAdmin ? "Ministry-wide Dashboard" : "Dashboard scoped to your assigned campuses"} />
      <section aria-label="Dashboard metrics" className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
      </section>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
        <AttentionPanel items={attentionResult.error ? null : attentionResult.items} error={attentionResult.error !== null} />
        <TeamAvailabilityCarousel teams={teamAvailabilityResult.error ? null : filterDashboardAvailabilityTeams(teamAvailabilityResult.teams ?? [], "available")} error={teamAvailabilityResult.error !== null} />
      </div>

      <div className="mt-7">
        <WorkflowPanel stages={dashboardWorkflow(counts)} total={counts?.currentCases ?? null} canNavigate={isAdmin} />
      </div>

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
        <AssignmentQueuePanel />
        <UpcomingPanel />
      </div>
      {!isAdmin ? <p className="mt-4 text-xs text-text-muted">Couple identities and Case details are available through your authorized Workspace, not from campus-wide Dashboard aggregates.</p> : null}
    </main>
  </>;
}
