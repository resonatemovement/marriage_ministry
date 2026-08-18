import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  UserRoundPlus,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DashboardMetric } from "@/features/dashboard/data";
import { cn } from "@/lib/utils";

const toneStyles: Record<DashboardMetric["tone"], { surface: string; icon: typeof Clock3 }> = {
  blue: { surface: "bg-info-soft text-info-strong", icon: HeartHandshake },
  amber: { surface: "bg-warning-soft text-warning-strong", icon: UserRoundPlus },
  green: { surface: "bg-success-soft text-success-strong", icon: CheckCircle2 },
  coral: { surface: "bg-danger-soft text-danger-strong", icon: Clock3 },
};

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const tone = toneStyles[metric.tone];
  const Icon = tone.icon;

  return (
    <Card className="group min-h-38 p-5 transition-shadow hover:shadow-[0_2px_4px_rgba(43,45,42,0.05),0_12px_30px_rgba(43,45,42,0.06)] sm:p-6">
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("grid size-9 place-items-center rounded-lg", tone.surface)}>
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <a
            href={metric.href}
            aria-label={`View ${metric.label}`}
            className="grid size-8 shrink-0 place-items-center rounded-md text-text-muted transition group-hover:bg-surface-muted group-hover:text-brand-primary"
          >
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="font-heading text-sm font-medium text-text-muted">{metric.label}</p>
            <p className="font-heading text-3xl font-extrabold text-text-primary">{metric.value}</p>
          </div>
          <p className="mt-2 text-xs text-text-muted">{metric.detail}</p>
        </div>
      </div>
    </Card>
  );
}
