import { AttentionPanel } from "@/components/dashboard/attention-panel";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { CapacityPanel } from "@/components/dashboard/capacity-panel";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MobileAppHeader } from "@/components/dashboard/mobile-app-header";
import { UpcomingPanel } from "@/components/dashboard/upcoming-panel";
import { WorkflowPanel } from "@/components/dashboard/workflow-panel";
import { Card } from "@/components/ui/card";
import { UserRoundPlus } from "lucide-react";
import { dashboardMetrics } from "@/lib/dashboard-data";

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
            <Card id="unassigned" className="flex flex-wrap items-center gap-5 bg-warning-soft/60 p-6 sm:p-7">
              <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-warning-strong shadow-sm">
                <UserRoundPlus className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-warning-strong">Assignment queue</p>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="font-heading text-lg font-bold text-text-primary">Two couples are ready to be matched</h2>
                    <p className="mt-1 text-sm text-text-muted">Assessment and interview steps are complete.</p>
                  </div>
                  <a href="#unassigned" className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-info-strong">
                    Review unassigned
                  </a>
                </div>
              </div>
            </Card>
            <UpcomingPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
