"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { GroupedAvatars } from "@/components/shared/grouped-avatars";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CounselingSessionCard, CounselingSessionPartner } from "./queries";
import { counselingSessionPresentation, counselingSessionsContentClassName, counselingSessionsGridClassName, counselingSessionsHeaderClassName, counselingSessionsRailClassName, counselingSessionsWorkspaceClassName, couplePhotoSlots, sessionCardActionClassName, sessionCardContainerClassName, sessionCardNavigation, sessionCardNavigationClassName } from "./presentation";
import { closeCounselingCase, scheduleCounselingMeeting } from "./actions";

function dateTime(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
const labels = { "schedule-initial": "Schedule Initial Meeting", "reschedule-initial": "Reschedule Initial Meeting", "schedule-meeting": "Schedule Meeting", "reschedule-meeting": "Reschedule Meeting", "schedule-next": "Schedule Next Meeting", "close-case": "Close Case" } as const;

function PartnerPhotos({ partners, coupleName }: { partners: CounselingSessionPartner[]; coupleName: string }) {
  const photos = couplePhotoSlots(partners);
  return <GroupedAvatars people={photos} label={`${coupleName} partner photos`} className="justify-center" />;
}

function MeetingSheet({ card, onOpenChange }: { card: CounselingSessionCard | null; onOpenChange: (open: boolean) => void }) {
  const [pending, start] = useTransition(); const [error, setError] = useState<string | null>(null);
  if (!card || !card.state.action || card.state.action === "close-case") return null;
  const meeting = card.state.meeting; const action = card.state.action;
  return <Sheet open={Boolean(card)} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-md"><SheetHeader><SheetTitle>{labels[action]}</SheetTitle><SheetDescription>{card.coupleName} · all counseling meetings are in person.</SheetDescription></SheetHeader><form className="grid gap-4 px-6 pb-6" action={(form) => start(async () => { const result = await scheduleCounselingMeeting(form); if (result?.error) setError(result.error); else onOpenChange(false); })}><input type="hidden" name="caseId" value={card.caseId}/><input type="hidden" name="sessionId" value={action.includes("initial") ? "" : action === "schedule-next" ? card.state.nextSession?.id ?? "" : card.state.session?.id ?? ""}/><label className="grid gap-1.5 text-sm font-medium">Date<input required name="date" type="date" defaultValue={meeting?.startsAt.slice(0, 10)} className="min-h-11 rounded-md border border-border bg-white px-3"/></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-sm font-medium">Start time<input required name="startTime" type="time" defaultValue={meeting?.startsAt.slice(11, 16)} className="min-h-11 rounded-md border border-border bg-white px-3"/></label><label className="grid gap-1.5 text-sm font-medium">End time<input required name="endTime" type="time" defaultValue={meeting?.endsAt.slice(11, 16)} className="min-h-11 rounded-md border border-border bg-white px-3"/></label></div><label className="grid gap-1.5 text-sm font-medium">Meeting location<input required name="location" defaultValue={meeting?.location} placeholder="Enter meeting location" className="min-h-11 rounded-md border border-border bg-white px-3"/></label>{error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}<button disabled={pending} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? "Saving…" : labels[action]}</button></form></SheetContent></Sheet>;
}

function SessionCard({ card, onSchedule, onClose, pending, closeError }: { card: CounselingSessionCard; onSchedule: (card: CounselingSessionCard) => void; onClose: (card: CounselingSessionCard) => void; pending: boolean; closeError: string | null }) {
  const { state } = card;
  const presentation = counselingSessionPresentation(state);
  const { statusLabel, homework } = presentation;
  const navigation = sessionCardNavigation(card.caseId, card.coupleName);
  return <Card className={sessionCardContainerClassName}>
    <Link href={navigation.href} aria-label={navigation.label} className={sessionCardNavigationClassName}><span className="sr-only">{navigation.label}</span></Link>
    <div className="pointer-events-none relative z-0">
    <PartnerPhotos partners={card.partners} coupleName={card.coupleName} />
    <h2 className="font-heading mt-3 text-center text-lg font-bold leading-snug text-text-primary">{card.coupleName}</h2>
    <div className="mt-3 flex justify-center"><Badge className={state.kind === "completed" ? "bg-success-soft text-success-strong" : "bg-info-soft text-info-strong"}>{statusLabel}</Badge></div>
    <p className="mt-2 min-h-5 text-center text-sm font-medium text-text-secondary">{presentation.sessionTitle}</p>
    <dl className="mt-4 grid gap-2 border-t border-border/70 pt-4 text-sm">
      {homework ? <div className="flex justify-between gap-3"><dt className="text-text-muted">Homework</dt><dd className={homework === "Completed" ? "font-medium text-success-strong" : "font-medium text-amber-800"}>{homework}</dd></div> : null}
      <div className="flex justify-between gap-3"><dt className="shrink-0 text-text-muted">Next Meeting</dt><dd className="text-right text-text-primary">{state.meeting ? <span className="inline-flex items-start justify-end gap-1"><CalendarDays className="mt-0.5 size-4 shrink-0 text-text-muted"/>{dateTime(state.meeting.startsAt)} · {state.meeting.location}</span> : "—"}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-text-muted">Progress</dt><dd className="text-right text-text-primary">{presentation.progress}</dd></div>
    </dl>
    </div>
    <div className={sessionCardActionClassName}>
      {state.action === "close-case" ? <div><button type="button" disabled={pending} onClick={() => onClose(card)} className="min-h-11 w-full rounded-md bg-brand-primary px-4 text-sm font-bold text-white">Close Case</button>{closeError ? <p role="alert" className="mt-2 text-xs text-danger-strong">{closeError}</p> : null}</div>
        : state.action ? <button onClick={() => onSchedule(card)} className="min-h-11 w-full rounded-md bg-brand-primary px-4 text-sm font-bold text-white">{labels[state.action]}</button> : <span className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-success-soft px-4 text-sm font-bold text-success-strong"><CheckCircle2 className="size-4"/>Journey Complete</span>}
    </div>
  </Card>;
}

export function SessionsWorkspace({ cards, coachesRail, className, isCoachWorkspace = false }: { cards: CounselingSessionCard[]; coachesRail?: ReactNode; className?: string; isCoachWorkspace?: boolean }) {
  const [selected, setSelected] = useState<CounselingSessionCard | null>(null); const [closeError, setCloseError] = useState<string | null>(null); const [pending, start] = useTransition();
  const schedule = (card: CounselingSessionCard) => setSelected(card);
  const close = (card: CounselingSessionCard) => start(async () => { const form = new FormData(); form.set("caseId", card.caseId); const result = await closeCounselingCase(form); if (result?.error) setCloseError(result.error); });
  return <main className={cn("mx-auto max-w-[1400px] p-5 sm:p-8 lg:p-10", className)}><div className={coachesRail ? counselingSessionsWorkspaceClassName : undefined}><header className={coachesRail ? counselingSessionsHeaderClassName : undefined}><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Counseling workspace</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Sessions</h1><p className="mt-2 text-sm text-text-muted">Schedule in-person counseling meetings and follow each couple’s current Session.</p></header>{coachesRail ? <aside className={counselingSessionsRailClassName}>{coachesRail}</aside> : null}<section aria-label="Counseling Sessions" className={cn(counselingSessionsGridClassName, coachesRail && counselingSessionsContentClassName, coachesRail && "mt-0")}>{cards.map((card) => <SessionCard key={card.caseId} card={card} onSchedule={schedule} onClose={close} pending={pending} closeError={closeError}/>)}{!cards.length ? <Card className="p-8 text-center text-sm text-text-muted sm:col-span-2">{isCoachWorkspace ? <><h2 className="font-heading text-lg font-bold text-text-primary">Pending couple assignment</h2><p className="mt-2">No couple has been assigned to you yet.</p></> : "No assigned counseling cases."}</Card> : null}</section></div><MeetingSheet card={selected} onOpenChange={(open) => { if (!open) setSelected(null); }}/></main>;
}
