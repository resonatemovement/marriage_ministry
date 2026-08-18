import { Card } from "@/components/ui/card";
import { teamCapacity } from "@/lib/dashboard-data";

import { CapacityRing } from "./capacity-ring";
import { SectionHeading } from "./section-heading";

export function CapacityPanel() {
  return (
    <Card id="capacity" className="p-6 sm:p-7">
      <SectionHeading title="Team Capacity" description="Current availability for new assignments" />
      <div className="mt-7 flex items-start justify-center gap-4 sm:gap-8">
        {teamCapacity.map((team) => <CapacityRing key={team.label} {...team} />)}
      </div>
    </Card>
  );
}
