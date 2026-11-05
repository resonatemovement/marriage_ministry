import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { AssignmentQueuePanel } from "@/components/dashboard/assignment-queue-panel";
import { CapacityPanel } from "@/components/dashboard/capacity-panel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { UpcomingPanel } from "@/components/dashboard/upcoming-panel";
import { WorkflowPanel } from "@/components/dashboard/workflow-panel";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { dashboardMetrics, dashboardWorkflow } from "@/features/dashboard/data";
import { getAdminDashboardCounts } from "@/features/dashboard/queries";
import { WorkspacePlaceholder } from "@/features/workspace/workspace-placeholder";
import { SessionsWorkspace } from "@/features/counseling-sessions/sessions-workspace";
import { getCounselingSessionCards } from "@/features/counseling-sessions/queries";
import { getCurrentCampusLeadCoaches, getCurrentCoachCounselors } from "@/features/counseling-sessions/workspace-queries";
import { getCampusLeadCoachNodes, getCoachCounselorNodes } from "@/features/counseling-sessions/oversight-rail-queries";
import { CampusLeadCoachesRail, CoachCounselorsRail } from "@/features/counseling-sessions/workspace-rail";
import { CoupleWorkspace } from "@/features/couple-workspace/workspace";
import { getCoupleWorkspaceData } from "@/features/couple-workspace/queries";
import { getCouplePrepareEnrichDocument } from "@/features/prepare-enrich/server";
import { requireActiveWorkspace } from "@/lib/auth/session";

export default async function WorkspaceRoute() {
  const { identity, workspace } = await requireActiveWorkspace("/workspace");

  if (workspace === "campus_lead" || workspace === "coach" || workspace === "counselor") {
    if (workspace === "campus_lead") {
      const [cards, coaches] = await Promise.all([getCounselingSessionCards(workspace), getCurrentCampusLeadCoaches()]);
      const coachNodes = await getCampusLeadCoachNodes(coaches);
      return <WorkspaceShell workspace="campus_lead" activeHref="/workspace" identity={identity}><SessionsWorkspace cards={cards} workspaceRail={<CampusLeadCoachesRail coaches={coachNodes} />} /></WorkspaceShell>;
    }
    if (workspace === "coach") {
      const [cards, counselors] = await Promise.all([getCounselingSessionCards(workspace), getCurrentCoachCounselors()]);
      const counselorNodes = await getCoachCounselorNodes(counselors);
      return <WorkspaceShell workspace="coach" activeHref="/workspace" identity={identity}><SessionsWorkspace cards={cards} workspaceRail={<CoachCounselorsRail counselors={counselorNodes} />} isCoachWorkspace /></WorkspaceShell>;
    }
    const cards = await getCounselingSessionCards(workspace);
    return <WorkspaceShell workspace="counselor" activeHref="/workspace" identity={identity}><SessionsWorkspace cards={cards} /></WorkspaceShell>;
  }
  if (workspace === "couple") {
    const [data, prepareEnrich] = await Promise.all([getCoupleWorkspaceData(identity.id), getCouplePrepareEnrichDocument()]);
    return <WorkspaceShell workspace="couple" activeHref="/workspace" identity={identity}><CoupleWorkspace data={data} prepareEnrich={prepareEnrich} /></WorkspaceShell>;
  }
  if (workspace !== "admin") {
    return <WorkspacePlaceholder workspace={workspace} identity={identity} />;
  }

  const dashboardResult = await getAdminDashboardCounts();
  const dashboardCounts = dashboardResult.error ? null : dashboardResult.counts;

  return (
    <WorkspaceShell workspace="admin" activeHref="/workspace" identity={identity}>
      <div id="overview">
        <DashboardHeader />
        <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          <section aria-label="Case summary" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {dashboardMetrics(dashboardCounts).map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
            <AttentionPanel />
            <CapacityPanel />
          </div>

          <div className="mt-7">
            <WorkflowPanel stages={dashboardWorkflow(dashboardCounts)} total={dashboardCounts?.currentCases ?? null} />
          </div>

          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
            <AssignmentQueuePanel />
            <UpcomingPanel />
          </div>
        </main>
      </div>
    </WorkspaceShell>
  );
}
