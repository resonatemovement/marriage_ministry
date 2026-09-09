"use client";

import { type ReactNode, useState, useTransition } from "react";
import { Pencil, Save, UserRoundCheck, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { assignCoach, assignCounselor, assignCoupleTeam, updatePeopleDetail } from "./detail-actions";
import { actionLabel, availablePeopleDetailActions, eligibleCoupleAssignmentTeams, teamOptionLabel, type PeopleDetailAction, type PeopleDetailActionContext } from "./detail-actions-model";
import type { PeopleDetail } from "./detail-model";
import { canDisplayCampus } from "../settings/campus-model";

type ActionResult = { error: string } | { success: true };
type Mutation = (formData: FormData) => Promise<ActionResult>;

function ActionButton({ action, onClick }: { action: PeopleDetailAction; onClick: () => void }) {
  const Icon = action === "edit" ? Pencil : action.includes("counselor") ? UserRoundCheck : UsersRound;
  return <button type="button" onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"><Icon className="size-4" aria-hidden="true" />{actionLabel(action)}</button>;
}

function CampusField({ detail, campuses }: { detail: PeopleDetail; campuses: PeopleDetailActionContext["campuses"] }) {
  return <div className="grid gap-1.5"><label htmlFor="people-campus" className="text-sm font-medium text-text-primary">Campus</label><Select name="campusId" defaultValue={detail.campusId ?? "__none__"}><SelectTrigger id="people-campus"><SelectValue placeholder="Select a campus" /></SelectTrigger><SelectContent><SelectItem value="__none__">No campus assigned</SelectItem>{campuses.filter((campus) => canDisplayCampus(campus, detail.campusId, campus.id)).map((campus) => <SelectItem key={campus.id} value={campus.id} disabled={!campus.active}>{campus.active ? campus.name : `${campus.name} (Inactive)`}</SelectItem>)}</SelectContent></Select></div>;
}

function EditForm({ detail, context, submit, onSuccess }: { detail: PeopleDetail; context: PeopleDetailActionContext; submit: Mutation; onSuccess: () => void }) {
  const profile = detail.kind === "profile" ? detail.member : null;
  return <ActionForm submit={submit} buttonLabel="Save changes" onSuccess={onSuccess}><input type="hidden" name="recordId" value={detail.id} />{detail.kind === "group" ? <label className="grid gap-1.5 text-sm font-medium text-text-primary">Team name<input required name="name" maxLength={120} defaultValue={detail.name} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></label> : <><input type="hidden" name="name" value={detail.name} /><label className="grid gap-1.5 text-sm font-medium text-text-primary">First name<input required name="firstName" maxLength={80} defaultValue={profile!.firstName} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></label><label className="grid gap-1.5 text-sm font-medium text-text-primary">Last name<input required name="lastName" maxLength={80} defaultValue={profile!.lastName} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></label></>}<CampusField detail={detail} campuses={context.campuses} /></ActionForm>;
}

function AssignmentForm({ detail, action, context, submit, onSuccess }: { detail: PeopleDetail; action: PeopleDetailAction; context: PeopleDetailActionContext; submit: Mutation; onSuccess: () => void }) {
  const coupleTeam = action === "assign-team" || action === "reassign-team";
  const counselor = action === "assign-coach" || action === "reassign-coach";
  const teams = coupleTeam ? eligibleCoupleAssignmentTeams(context) : counselor ? context.coachTeams : context.counselorTeams;
  const current = coupleTeam ? context.currentCoupleTeam : counselor ? context.currentCoachTeam : context.currentCounselorTeam;
  const defaultValue = current?.id ?? "";
  return <ActionForm submit={submit} buttonLabel={actionLabel(action)} onSuccess={onSuccess}><input type="hidden" name="recordId" value={detail.id} />{current ? <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-text-muted">Current team: <span className="font-semibold text-text-primary">{teamOptionLabel(current, coupleTeam)}</span></p> : null}<div className="grid gap-1.5"><label htmlFor="people-target-team" className="text-sm font-medium text-text-primary">{coupleTeam ? "Team" : counselor ? "Coach team" : "Counselor team"}</label><Select required name="targetGroupId" defaultValue={defaultValue}><SelectTrigger id="people-target-team"><SelectValue placeholder="Select a team" /></SelectTrigger><SelectContent>{teams.map((team) => <SelectItem key={team.id} value={team.id}>{teamOptionLabel(team, coupleTeam)}</SelectItem>)}</SelectContent></Select></div></ActionForm>;
}

function ActionForm({ children, submit, buttonLabel, onSuccess }: { children: ReactNode; submit: Mutation; buttonLabel: string; onSuccess: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); setError(null); const formData = new FormData(event.currentTarget); if (formData.get("campusId") === "__none__") formData.set("campusId", ""); startTransition(async () => { const result = await submit(formData); if ("error" in result) { setError(result.error); return; } onSuccess(); router.refresh(); }); }}>{children}{error ? <p role="alert" className="text-sm text-error-strong">{error}</p> : null}<div className="flex justify-end gap-3"><button type="button" onClick={onSuccess} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary">Cancel</button><button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60"><Save className="size-4" aria-hidden="true" />{pending ? "Saving..." : buttonLabel}</button></div></form>;
}

export function PeopleDetailActions({ detail, context }: { detail: PeopleDetail; context: PeopleDetailActionContext }) {
  const [openAction, setOpenAction] = useState<PeopleDetailAction | null>(null);
  const actions = availablePeopleDetailActions(detail, context);
  const submit = openAction === "edit" ? updatePeopleDetail : openAction === "assign-team" || openAction === "reassign-team" ? assignCoupleTeam : openAction?.includes("coach") ? assignCoach : assignCounselor;

  return <><div className="flex flex-wrap gap-2">{actions.map((action) => <ActionButton key={action} action={action} onClick={() => setOpenAction(action)} />)}</div><Sheet open={openAction !== null} onOpenChange={(open) => setOpenAction(open ? openAction : null)}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>{openAction ? actionLabel(openAction) : "People action"}</SheetTitle><SheetDescription>{openAction === "edit" ? "Update the safe fields available for this record." : "Choose an active team to update this assignment."}</SheetDescription></SheetHeader><div className="p-6">{openAction === "edit" ? <EditForm detail={detail} context={context} submit={submit} onSuccess={() => setOpenAction(null)} /> : openAction ? <AssignmentForm detail={detail} action={openAction} context={context} submit={submit} onSuccess={() => setOpenAction(null)} /> : null}</div></SheetContent></Sheet></>;
}
