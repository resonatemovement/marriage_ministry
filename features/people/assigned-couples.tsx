"use client";

import { useState, useTransition } from "react";
import { UserRoundCheck as UsersRound } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignCoupleToCounselorOfRecord } from "./detail-actions";
import type { AssignedCouple } from "./detail-model";
import { RelationshipCard } from "./relationship-card";
import { UnassignCounselorOfRecord } from "./unassign-counselor-of-record";
import { peopleDetailHref } from "./breadcrumbs";

export function AssignedCouples({ detailId, teamName, assignedCouples, eligibleCouples, canManage, canUnassign, teamType, trail = [] }: { detailId: string; teamName: string; assignedCouples: AssignedCouple[]; eligibleCouples: { id: string; name: string }[]; canManage: boolean; canUnassign: boolean; teamType: "coach" | "counselor" | "campus_lead"; trail?: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canAssign = canManage && eligibleCouples.length > 0;
  const teamLabel = teamType === "counselor" ? "Counselor" : teamType === "campus_lead" ? "Campus Lead" : "Coach";
  const targetField = "teamGroupId";
  const renderEligibleCouple = (couple: { id: string; name: string }) => <SelectItem key={couple.id} value={couple.id}>{couple.name}</SelectItem>;
  const footer = canManage ? <><button type="button" aria-label="Assign Couple" disabled={!canAssign} onClick={() => setOpen(true)} className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><UsersRound className="size-4" aria-hidden="true" />Assign</button>{!eligibleCouples.length ? <p className="mt-2 text-xs text-text-muted">No eligible couples available to assign.</p> : null}</> : null;
  return <><RelationshipCard title="Assigned Couples" rows={assignedCouples.map((couple) => ({ id: couple.id, name: couple.name, metadata: `${couple.campus ?? "Campus not assigned"} · ${couple.status ?? "No status"}`, href: peopleDetailHref(couple.id, trail), action: canUnassign ? <UnassignCounselorOfRecord coupleId={couple.id} coupleName={couple.name} teamName={teamName} /> : undefined }))} empty={`No couples are currently assigned to this ${teamLabel} team.`} footer={footer} /><Sheet open={open && canAssign} onOpenChange={setOpen}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>Assign Couple</SheetTitle><SheetDescription>Choose an eligible Couple for this {teamLabel} team.</SheetDescription></SheetHeader><div className="p-6"><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setError(null); const form = new FormData(event.currentTarget); form.set(targetField, detailId); startTransition(async () => { const result = await assignCoupleToCounselorOfRecord(form); if ("error" in result) { setError(result.error); return; } setOpen(false); window.location.reload(); }); }}><input type="hidden" name={targetField} value={detailId} /><label className="grid gap-1.5 text-sm font-medium">Couple<Select required name="coupleGroupId"><SelectTrigger><SelectValue placeholder="Select a Couple" /></SelectTrigger><SelectContent>{eligibleCouples.map(renderEligibleCouple)}</SelectContent></Select></label>{error ? <p role="alert" className="text-sm text-error-strong">{error}</p> : null}<div className="flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted">Cancel</button><button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Assigning..." : "Assign Couple"}</button></div></form></div></SheetContent></Sheet></>;
}
