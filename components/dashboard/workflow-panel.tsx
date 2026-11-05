import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { CaseStatus } from "@/lib/counseling/domain";
import { dashboardCoupleListHref } from "@/features/dashboard/data";

import { SectionHeading } from "./section-heading";

export function WorkflowPanel({ stages, total }: { stages: readonly { status: CaseStatus; label: string; count: number | null }[]; total: number | null }) {
  return (
    <Card id="workflow" className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <SectionHeading
          title="Counseling Workflow"
          description="Unique Couples by current Case status"
          action={<span className="hidden rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted sm:block">{total === null ? "Live data unavailable" : `${total} current Cases`}</span>}
        />
      </div>
      <div className="grid border-t border-border/70 sm:grid-cols-2 xl:grid-cols-9">
        {stages.map((stage, index) => (
          <Link
            key={stage.status}
            href={dashboardCoupleListHref(stage.status)}
            aria-label={`View Couples in ${stage.label} status`}
            className="relative flex min-h-28 items-center justify-between gap-3 border-b border-border/70 p-4 transition-colors hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none sm:border-r sm:last:border-r-0 xl:border-b-0"
          >
            <div>
              <p className="font-heading text-2xl font-extrabold text-text-primary">{stage.count ?? "—"}</p>
              <p className="font-heading mt-1 text-xs font-medium text-text-muted">{stage.label}</p>
            </div>
            {index < stages.length - 1 ? (
              <ArrowRight className="pointer-events-none size-4 text-border xl:absolute xl:-right-2.5 xl:z-10 xl:rounded-full xl:bg-surface" aria-hidden="true" />
            ) : null}
          </Link>
        ))}
      </div>
    </Card>
  );
}
