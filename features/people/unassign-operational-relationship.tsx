"use client";

import { useState, useTransition } from "react";
import { UserMinus } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { unassignCoachFromCampusLead, unassignCounselorFromCoach } from "./detail-actions";

type Relationship = "campus-lead-coach" | "coach-counselor";

export function UnassignOperationalRelationship({ relationship, sourceId, sourceName, targetId, targetName, open = false, onOpenChange, menuOnly = false }: { relationship: Relationship; sourceId: string; sourceName: string; targetId: string; targetName: string; open?: boolean; onOpenChange?: (open: boolean) => void; menuOnly?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = relationship === "campus-lead-coach" ? unassignCoachFromCampusLead : unassignCounselorFromCoach;
  const sourceField = relationship === "coach-counselor" ? "coachGroupId" : "campusLeadGroupId";
  const targetField = relationship === "campus-lead-coach" ? "coachGroupId" : "counselorGroupId";
  const title = relationship === "campus-lead-coach" ? "Unassign Coach" : "Unassign Counselor";

  if (menuOnly) return <DropdownMenuItem variant="destructive" onSelect={() => onOpenChange?.(true)}>
      <UserMinus className="size-4" aria-hidden="true" />
      Unassign
    </DropdownMenuItem>;

  return <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Unassign {targetName} from {sourceName}? This ends the active relationship. Relationship history will be preserved.</SheetDescription>
        </SheetHeader>
        <form className="grid gap-5 p-6" onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await submit(new FormData(event.currentTarget));
            if ("error" in result) { setError(result.error); return; }
            onOpenChange?.(false);
            window.location.reload();
          });
        }}>
          <input type="hidden" name={sourceField} value={sourceId} />
          <input type="hidden" name={targetField} value={targetId} />
          {error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => onOpenChange?.(false)} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-60">Cancel</button>
            <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-danger-strong px-4 py-2 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Unassigning..." : "Unassign"}</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  </>;
}
