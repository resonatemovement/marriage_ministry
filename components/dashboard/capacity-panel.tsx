import { Card } from "@/components/ui/card";
import { SectionHeading } from "./section-heading";

export function CapacityPanel() {
  return (
    <Card id="capacity" className="p-6 sm:p-7">
      <SectionHeading title="Team Capacity" description="Current availability for new assignments" />
      <p className="mt-6 text-sm text-text-muted">Not yet available.</p>
    </Card>
  );
}
