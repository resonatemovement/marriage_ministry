"use client";

import { useState, useTransition } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { unassignCounselorOfRecord } from "./detail-actions";

export function UnassignCounselorOfRecord({ coupleId, coupleName, teamName }: { coupleId: string; coupleName: string; teamName: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return <><button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-danger-strong hover:underline">Unassign</button><Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>Unassign Counselor</SheetTitle><SheetDescription>Unassign {coupleName} from {teamName}? This ends the active counseling assignment. Assignment history will be preserved.</SheetDescription></SheetHeader><form className="grid gap-5 p-6" onSubmit={(event) => { event.preventDefault(); setError(null); startTransition(async () => { const result = await unassignCounselorOfRecord(new FormData(event.currentTarget)); if ("error" in result) { setError(result.error); return; } setOpen(false); window.location.reload(); }); }}><input type="hidden" name="coupleGroupId" value={coupleId} />{error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}<div className="flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted disabled:opacity-60">Cancel</button><button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-md bg-danger-strong px-4 py-2 text-sm font-semibold text-white hover:bg-danger-strong/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Unassigning..." : "Unassign"}</button></div></form></SheetContent></Sheet></>;
}
