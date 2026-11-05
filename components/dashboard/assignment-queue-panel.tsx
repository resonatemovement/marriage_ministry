import { Card } from "@/components/ui/card";

export function AssignmentQueuePanel() {
  return (
    <Card
      id="unassigned"
      className="flex flex-wrap items-center gap-5 bg-warning-soft/60 p-6 sm:p-7"
    >
      <div className="min-w-0 flex-1">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-warning-strong">
          Assignment queue
        </p>
        <p className="mt-2 text-sm text-text-muted">Assignment queue details are not yet available.</p>
      </div>
    </Card>
  );
}
