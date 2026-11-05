import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { CaseStatus } from "@/lib/counseling/domain";
import { dashboardCoupleListHref } from "@/features/dashboard/data";

import { SectionHeading } from "./section-heading";

export function WorkflowPanel({ stages, total, canNavigate = true }: { stages: readonly { status: CaseStatus; label: string; count: number | null }[]; total: number | null; canNavigate?: boolean }) {
  return (
    <Card id="workflow" className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <SectionHeading
          title="Counseling Workflow"
          description="Unique Couples by current Case status"
          action={total === null ? <span className="hidden rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted sm:block">Live data unavailable</span> : null}
        />
      </div>
      <div className="grid border-t border-border/70 sm:grid-cols-2 xl:grid-cols-9">
        {stages.map((stage, index) => (
          <div key={stage.status} className="relative min-h-28 border-b border-border/70 sm:border-r sm:last:border-r-0 xl:border-b-0">
            {canNavigate ? <Link href={dashboardCoupleListHref(stage.status)} aria-label={`View Couples in ${stage.label} status`} className="absolute inset-0 z-0 rounded-sm transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none" /> : null}
            <div className="relative pointer-events-none p-4">
            <div>
              <p className="font-heading text-2xl font-extrabold text-text-primary">{stage.count ?? "—"}</p>
              <p className="font-heading mt-1 text-xs font-medium text-text-muted">{stage.label}</p>
            </div>
            {index < stages.length - 1 ? (
              <ArrowRight className="pointer-events-none size-4 text-border xl:absolute xl:-right-2.5 xl:z-10 xl:rounded-full xl:bg-surface" aria-hidden="true" />
            ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
