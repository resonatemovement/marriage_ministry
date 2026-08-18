import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { AssignmentQueuePanel } from "@/components/dashboard/assignment-queue-panel";
import { CapacityPanel } from "@/components/dashboard/capacity-panel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { UpcomingPanel } from "@/components/dashboard/upcoming-panel";
import { WorkflowPanel } from "@/components/dashboard/workflow-panel";
import { AppSidebar } from "@/components/navigation/app-sidebar";
import { MobileAppHeader } from "@/components/navigation/mobile-app-header";
import { dashboardMetrics } from "@/features/dashboard/data";

export default function AdminDashboardPage() {
  return (
    <div id="overview" className="min-h-screen bg-background">
      <AppSidebar />
      <div className="lg:pl-64">
        <MobileAppHeader />
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
    </div>
  );
}
