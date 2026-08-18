import { UserRoundPlus } from "lucide-react";

import { Card } from "@/components/ui/card";

export function AssignmentQueuePanel() {
  return (
    <Card
      id="unassigned"
      className="flex flex-wrap items-center gap-5 bg-warning-soft/60 p-6 sm:p-7"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-warning-strong shadow-sm">
        <UserRoundPlus className="size-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-warning-strong">
          Assignment queue
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-text-primary">
              Two couples are ready to be matched
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Assessment and interview steps are complete.
            </p>
          </div>
          <a
            href="#unassigned"
            className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-info-strong"
          >
            Review unassigned
          </a>
        </div>
      </div>
    </Card>
  );
}
