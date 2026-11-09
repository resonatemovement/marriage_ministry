"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { updateCounselingTeamAvailability } from "./team-availability-actions";

export function TeamAvailabilityToggle({ teamId, initialValue }: { teamId: string; initialValue: boolean }) {
  const [checked, setChecked] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(nextValue: boolean) {
    if (isPending || nextValue === checked) return;
    const previousValue = checked;
    setChecked(nextValue);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateCounselingTeamAvailability(teamId, nextValue);
        if (result.error) throw new Error(result.error);
      } catch {
        setChecked(previousValue);
        setError("Team availability could not be saved. Please try again.");
      }
    });
  }

  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-busy={isPending}>
    <label htmlFor="accepting-new-couples" className="text-sm font-medium text-text-primary">Accepting New Couples</label>
    <Switch id="accepting-new-couples" checked={checked} onCheckedChange={toggle} disabled={isPending} aria-label="Accepting New Couples" />
    {error ? <span role="status" className="basis-full text-xs text-destructive">{error}</span> : null}
  </div>;
}
