import Link from "next/link";
import { CalendarDays, ArrowRight } from "lucide-react";

import { GroupedAvatars } from "@/components/shared/grouped-avatars";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { counselingStatusLabel } from "@/lib/counseling/domain";
import type { PrepareEnrichDocument } from "@/features/prepare-enrich/model";
import { homeworkProgressLabel } from "@/features/homework/presentation";
import { homeworkProgressBadgeClass } from "@/features/homework/presentation";
import { MeetingRealtime } from "@/features/counseling-sessions/meeting-realtime";
import { CaseLifecycleRealtime } from "@/features/counseling-sessions/case-lifecycle-realtime";

import type { CoupleWorkspaceData } from "./queries";
import { CoupleBreadcrumb } from "./couple-breadcrumb";
import { HomeworkProgressRealtime } from "@/features/counseling-sessions/homework-progress-realtime";

function dateTime(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function TeamCard({ team }: Pick<CoupleWorkspaceData, "team">) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Team</p><div className="mt-3"><p className="text-sm font-semibold text-text-primary">Counselor</p>{team.counselor ? <Link href={`/workspace/contacts/${team.counselor.caseId}/${team.counselor.id}`} className="mt-0.5 inline-flex text-sm text-brand-primary hover:underline">{team.counselor.name}</Link> : <p className="mt-0.5 text-sm text-text-muted">Not assigned</p>}</div></Card>;
}

function PrepareEnrichCard({ document }: { document: PrepareEnrichDocument | null }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Prepare &amp; Enrich</p><p className="font-heading mt-2 text-base font-bold text-text-primary">Couple Version</p>{document ? <><p className="mt-1 break-all text-sm text-text-muted">{document.fileName}</p><a href="/workspace/prepare-enrich" className="mt-4 inline-flex min-h-10 items-center rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90">View / Download</a></> : <p className="mt-1 text-sm text-text-muted">No document uploaded.</p>}</Card>;
}

function CurrentSessionCard({ data }: { data: CoupleWorkspaceData }) {
  return <Card id="current-session" className="h-full p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current Session</p>{data.completed ? <p className="font-heading mt-2 text-xl font-bold text-text-primary">Counseling journey complete</p> : data.currentSession ? <><div className="mt-2 flex flex-wrap items-center gap-2"><h2 className="font-heading text-xl font-bold text-text-primary">Session {data.currentSession.number}: {data.currentSession.title}</h2><Badge className="bg-info-soft text-info-strong">Current</Badge></div><Link href={`/workspace/sessions/${data.currentSession.caseSessionId}`} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90">Open Session<ArrowRight className="size-4" aria-hidden="true" /></Link></> : <><p className="font-heading mt-2 text-xl font-bold text-text-primary">Initial Meeting</p><p className="mt-2 text-sm text-text-muted">Your counseling team will share Session Materials and Homework after Session 1 is scheduled.</p></>}</Card>;
}

function HomeworkSummaryCard({ data }: { data: CoupleWorkspaceData }) {
  const emptyState = !data.currentSession ? "Homework will appear when your first Session begins." : !data.homeworkRequired ? "No Homework for this Session" : null;
  const content = <><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Homework</p>{emptyState ? <p className="font-heading mt-2 text-base font-bold text-text-primary">{emptyState}</p> : <div className="mt-2 flex flex-wrap items-center gap-2"><h2 className="font-heading text-base font-bold text-text-primary">Homework</h2>{data.homework ? <Badge className={homeworkProgressBadgeClass(data.homework.status)}>{homeworkProgressLabel(data.homework.status)}</Badge> : <p className="font-heading text-base font-bold text-text-primary">Homework status unavailable</p>}</div>}{data.currentSession ? <p className="mt-2 text-sm text-text-muted">Private to you</p> : null}</>;
  return <Card className="h-full p-5">{data.currentSession ? <Link href={`/workspace/sessions/${data.currentSession.caseSessionId}?tab=homework`} aria-label="Open Session Homework" className="block rounded-sm focus-visible:bg-surface-muted">{content}</Link> : content}</Card>;
}

function CompletedJourneyCard() {
  return <Card className="p-6 sm:p-8"><h2 className="font-heading text-2xl font-bold text-brand-secondary">Congratulations! You&apos;ve Completed the Program!</h2><p className="mt-4 max-w-2xl text-base leading-7 text-text-primary">You&apos;ve completed your counseling journey with Resonate. We hope the lessons, conversations, and time you&apos;ve invested together continue to strengthen your relationship.</p><p className="mt-3 max-w-2xl text-sm leading-6 text-text-muted">Your Session Material and completed Homework will remain available whenever you&apos;d like to revisit them.</p><Link href="/workspace/sessions" className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90">Review Session Material<ArrowRight className="size-4" aria-hidden="true" /></Link></Card>;
}

export function CoupleWorkspace({ data, prepareEnrich }: { data: CoupleWorkspaceData | null; prepareEnrich: PrepareEnrichDocument | null }) {
  if (!data) return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10"><CoupleBreadcrumb parent="Workspace" current="Couple Workspace" /><Card className="p-6"><h1 className="font-heading text-2xl font-bold text-text-primary">Couple Workspace</h1><p className="mt-2 text-sm text-text-muted">Your counseling journey will appear here when a case is available.</p></Card></main>;
  const status = counselingStatusLabel(data.status, Boolean(data.team.counselor), false) ?? data.status;
  const progress = data.currentSession ? `Session ${data.currentSession.actualSequence} of ${data.totalSessions}` : `Session 0 of ${data.totalSessions}`;
  const progressValue = data.totalSessions ? Math.min(100, ((data.currentSession?.actualSequence ?? 0) / data.totalSessions) * 100) : 0;
  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <MeetingRealtime caseId={data.caseId} />
    <CaseLifecycleRealtime caseId={data.caseId} />
    {data.homeworkRevisionId ? <HomeworkProgressRealtime assignmentRevisionId={data.homeworkRevisionId} /> : null}
    <CoupleBreadcrumb parent="Workspace" current="Couple Workspace" />
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]"><div className="space-y-6"><Card className="p-5 sm:p-7"><header className="flex flex-col gap-5 sm:flex-row sm:items-center"><GroupedAvatars people={data.partners} label={`${data.coupleName} partner photos`} /><div><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Couple Workspace</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{data.coupleName}</h1><p className="mt-2 text-sm text-text-muted">Follow your counseling journey, current Session, and next meeting.</p></div></header></Card>{data.completed ? <CompletedJourneyCard /> : <div className="grid items-stretch gap-4 sm:grid-cols-2"><CurrentSessionCard data={data} /><HomeworkSummaryCard data={data} /><Card className="h-full p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Next Meeting</p><p className="mt-2 flex items-start gap-2 text-sm font-medium text-text-primary">{data.nextMeeting ? <><CalendarDays className="mt-0.5 size-4 shrink-0 text-text-muted" />{dateTime(data.nextMeeting.startsAt)} · {data.nextMeeting.location}</> : "No meeting scheduled"}</p></Card><Card className="h-full p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Progress</p><p className="font-heading mt-2 text-lg font-bold text-text-primary">{progress}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-brand-primary" style={{ width: `${progressValue}%` }} /></div></Card></div>}</div><aside className="space-y-4"><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Status</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{status}</p></Card><TeamCard team={data.team} /><PrepareEnrichCard document={prepareEnrich} /></aside></section>
  </main>;
}
