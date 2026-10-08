import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { AssignmentQueuePanel } from "@/components/dashboard/assignment-queue-panel";
import { CapacityPanel } from "@/components/dashboard/capacity-panel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { UpcomingPanel } from "@/components/dashboard/upcoming-panel";
import { WorkflowPanel } from "@/components/dashboard/workflow-panel";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { dashboardMetrics } from "@/features/dashboard/data";
import { WorkspacePlaceholder } from "@/features/workspace/workspace-placeholder";
import { SessionsWorkspace } from "@/features/counseling-sessions/sessions-workspace";
import { getCounselingSessionCards } from "@/features/counseling-sessions/queries";
import { getCurrentCampusLeadCoaches } from "@/features/counseling-sessions/workspace-queries";
import { CampusLeadCoachesRail } from "@/features/counseling-sessions/workspace-rail";
import { CoupleWorkspace } from "@/features/couple-workspace/workspace";
import { getCoupleWorkspaceData } from "@/features/couple-workspace/queries";
import { getCouplePrepareEnrichDocument } from "@/features/prepare-enrich/server";
import { requireActiveWorkspace } from "@/lib/auth/session";

export default async function WorkspaceRoute() {
  const { identity, workspace } = await requireActiveWorkspace("/workspace");

  if (workspace === "campus_lead" || workspace === "coach" || workspace === "counselor") {
    const [cards, coaches] = await Promise.all([
      getCounselingSessionCards(),
      workspace === "campus_lead" ? getCurrentCampusLeadCoaches() : Promise.resolve(null),
    ]);
    return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}>
      {workspace === "campus_lead" ? <SessionsWorkspace cards={cards} coachesRail={<CampusLeadCoachesRail coaches={coaches ?? []} />} /> : <SessionsWorkspace cards={cards} isCoachWorkspace={workspace === "coach"} />}
    </WorkspaceShell>;
  }
  if (workspace === "couple") {
    const [data, prepareEnrich] = await Promise.all([getCoupleWorkspaceData(identity.id), getCouplePrepareEnrichDocument()]);
    return <WorkspaceShell workspace="couple" activeHref="/workspace" identity={identity}><CoupleWorkspace data={data} prepareEnrich={prepareEnrich} /></WorkspaceShell>;
  }
  if (workspace !== "admin") {
    return <WorkspacePlaceholder workspace={workspace} identity={identity} />;
  }

  return (
    <WorkspaceShell workspace="admin" activeHref="/workspace" identity={identity}>
      <div id="overview">
        <DashboardHeader />
        <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
          <section aria-label="Case summary" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {dashboardMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}
          </section>

          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
            <AttentionPanel />
            <CapacityPanel />
          </div>

          <div className="mt-7">
            <WorkflowPanel />
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
