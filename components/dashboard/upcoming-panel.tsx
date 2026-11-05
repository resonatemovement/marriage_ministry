import { Card } from "@/components/ui/card";

import { SectionHeading } from "./section-heading";

export function UpcomingPanel() {
  return (
    <Card className="p-6 sm:p-7">
      <SectionHeading title="Upcoming Activity" description="Next operational checkpoints" />
      <p className="mt-6 text-sm text-text-muted">Not yet available.</p>
    </Card>
  );
}
