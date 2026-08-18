import { CalendarDays } from "lucide-react";

import { Card } from "@/components/ui/card";
import { upcomingItems } from "@/features/dashboard/data";

import { SectionHeading } from "./section-heading";

export function UpcomingPanel() {
  return (
    <Card className="p-6 sm:p-7">
      <SectionHeading title="Upcoming Activity" description="Next operational checkpoints" />
      <div className="mt-6 divide-y divide-border">
        {upcomingItems.map((item) => (
          <div key={`${item.date}-${item.title}`} className="flex gap-4 py-4 first:pt-0 last:pb-0">
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-info-soft text-info-strong">
              <CalendarDays className="mb-0.5 size-3.5" aria-hidden="true" />
              <span className="text-[10px] font-bold">{item.date}</span>
            </div>
            <div className="min-w-0 self-center">
              <p className="font-heading truncate text-sm font-bold text-text-primary">{item.title}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
