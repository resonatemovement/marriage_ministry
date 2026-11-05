import { Card } from "@/components/ui/card";

import { SectionHeading } from "./section-heading";

export function AttentionPanel() {
  return (
    <Card id="attention" className="p-6 sm:p-7">
      <SectionHeading
        title="Needs Attention"
        description="Operational follow-up queue"
      />
      <p className="mt-6 text-sm text-text-muted">Not yet available.</p>
    </Card>
  );
}
