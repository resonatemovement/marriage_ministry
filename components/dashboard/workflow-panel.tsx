import { ArrowRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { workflow } from "@/lib/dashboard-data";

import { SectionHeading } from "./section-heading";

export function WorkflowPanel() {
  return (
    <Card id="workflow" className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <SectionHeading
          title="Counseling Workflow"
          description="Couples across the current program lifecycle"
          action={<span className="hidden rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted sm:block">82 total cases</span>}
        />
      </div>
      <div className="grid border-t border-border/70 sm:grid-cols-2 xl:grid-cols-7">
        {workflow.map((stage, index) => (
          <a
            key={stage.status}
            href={`#${stage.status}`}
            className="group relative flex min-h-28 items-center justify-between gap-3 border-b border-border/70 p-4 hover:bg-surface-muted/70 sm:border-r sm:last:border-r-0 xl:border-b-0"
          >
            <div>
              <p className="font-heading text-2xl font-extrabold text-text-primary">{stage.count}</p>
              <p className="font-heading mt-1 text-xs font-medium text-text-muted">{stage.label}</p>
            </div>
            {index < workflow.length - 1 ? (
              <ArrowRight className="size-4 text-border transition group-hover:text-brand-primary xl:absolute xl:-right-2.5 xl:z-10 xl:rounded-full xl:bg-surface" aria-hidden="true" />
            ) : null}
          </a>
        ))}
      </div>
    </Card>
  );
}
