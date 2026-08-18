import { ArrowRight, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { attentionItems } from "@/features/dashboard/data";

import { SectionHeading } from "./section-heading";

export function AttentionPanel() {
  return (
    <Card id="attention" className="p-6 sm:p-7">
      <SectionHeading
        title="Needs Attention"
        description="Items that need an operational decision"
        action={
          <a href="#attention" className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline">
            View all <ArrowRight className="size-3.5" aria-hidden="true" />
          </a>
        }
      />
      <div className="mt-6 divide-y divide-border">
        {attentionItems.map((item) => (
          <a
            href="#attention"
            key={item.couple}
            className="flex items-center gap-4 py-4.5 first:pt-0 last:pb-0"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-warning-soft text-warning-strong">
              <Clock3 className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading truncate text-sm font-bold text-text-primary">{item.couple}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{item.detail}</p>
            </div>
            <Badge className={item.urgency === "Today" ? "bg-danger-soft text-danger-strong" : "bg-muted text-muted-foreground"}>
              {item.urgency}
            </Badge>
          </a>
        ))}
      </div>
    </Card>
  );
}
