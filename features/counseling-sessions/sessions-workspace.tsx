import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { GroupedAvatars } from "@/components/shared/grouped-avatars";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CounselingSessionCard, CounselingSessionPartner } from "./queries";
import { counselingSessionPresentation, counselingSessionsContentClassName, counselingSessionsGridClassName, counselingSessionsHeaderClassName, counselingSessionsRailClassName, counselingSessionsWorkspaceClassName, couplePhotoSlots, sessionCardContainerClassName, sessionCardNavigation, sessionCardNavigationClassName } from "./presentation";

function dateTime(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function PartnerPhotos({ partners, coupleName }: { partners: CounselingSessionPartner[]; coupleName: string }) {
  const photos = couplePhotoSlots(partners);
  return <GroupedAvatars people={photos} label={`${coupleName} partner photos`} className="justify-center" />;
}

function SessionCard({ card }: { card: CounselingSessionCard }) {
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
  </Card>;
}

export function SessionsWorkspace({ cards, coachesRail, className, isCoachWorkspace = false }: { cards: CounselingSessionCard[]; coachesRail?: ReactNode; className?: string; isCoachWorkspace?: boolean }) {
  return <main className={cn("mx-auto max-w-[1400px] p-5 sm:p-8 lg:p-10", className)}><div className={coachesRail ? counselingSessionsWorkspaceClassName : undefined}><header className={coachesRail ? counselingSessionsHeaderClassName : undefined}><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Counseling workspace</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Sessions</h1><p className="mt-2 text-sm text-text-muted">Open a counseling case to schedule meetings and manage its current Session.</p></header>{coachesRail ? <aside className={counselingSessionsRailClassName}>{coachesRail}</aside> : null}<section aria-label="Counseling Sessions" className={cn(counselingSessionsGridClassName, coachesRail && counselingSessionsContentClassName, coachesRail && "mt-0")}>{cards.map((card) => <SessionCard key={card.caseId} card={card}/>)}{!cards.length ? <Card className="p-8 text-center text-sm text-text-muted sm:col-span-2">{isCoachWorkspace ? <><h2 className="font-heading text-lg font-bold text-text-primary">Pending couple assignment</h2><p className="mt-2">No couple has been assigned to you yet.</p></> : "No assigned counseling cases."}</Card> : null}</section></div></main>;
}
