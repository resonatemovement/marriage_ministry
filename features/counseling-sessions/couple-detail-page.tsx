import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { GroupedAvatars } from "@/components/shared/grouped-avatars";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { counselingStatusLabel } from "@/lib/counseling/domain";
import type { PrepareEnrichDocument } from "@/features/prepare-enrich/model";
import { homeworkProgressBadgeClass, homeworkProgressLabel } from "@/features/homework/presentation";

import type { CounselingSessionCard } from "./queries";
import { counselingProgressPercent, counselingSessionPresentation, couplePhotoSlots } from "./presentation";
import { SessionLifecycleControls } from "./session-lifecycle-controls";
import { ExportSessionMaterialsButton } from "@/features/session-materials-export/export-session-materials-button";
import { DevResetControl } from "./dev-reset-control";
import { MeetingNotificationStatus, type MeetingNotificationDelivery } from "./meeting-notification-status";
import { MeetingNotificationRealtime } from "./meeting-notification-realtime";
import { formatCounselingMeetingDateTime } from "./meeting-date-time";
import { HomeworkProgressRealtime } from "./homework-progress-realtime";
import { MeetingRealtime } from "./meeting-realtime";
import { CaseLifecycleRealtime } from "./case-lifecycle-realtime";
import { ReopenHomeworkButton } from "./homework-reopen-button";

function PartnerPhotos({ card }: { card: CounselingSessionCard }) {
  return <GroupedAvatars people={couplePhotoSlots(card.partners)} label={`${card.coupleName} partner photos`} />;
}

function PrepareEnrichCard({ caseId, document }: { caseId: string; document: PrepareEnrichDocument | null }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Prepare &amp; Enrich</p><p className="font-heading mt-2 text-base font-bold text-text-primary">Counselor Copy</p>{document ? <><p className="mt-1 break-all text-sm text-text-muted">{document.fileName}</p><a href={`/workspace/cases/${caseId}/prepare-enrich`} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90">View / Download</a></> : <p className="mt-1 text-sm text-text-muted">No document uploaded.</p>}</Card>;
}

type MeetingNotificationRow = MeetingNotificationDelivery;

export function CounselingCoupleDetailPage({ card, prepareEnrich = null, isAdmin = false, canReopenHomework = false, canResetCounselingJourney = false, meetingNotifications = [] }: { card: CounselingSessionCard; prepareEnrich?: PrepareEnrichDocument | null; isAdmin?: boolean; canReopenHomework?: boolean; canResetCounselingJourney?: boolean; meetingNotifications?: MeetingNotificationRow[] }) {
  const presentation = counselingSessionPresentation(card.state);
  const progressPercent = counselingProgressPercent(presentation.progress, card.state.kind === "completed");
  const caseStatus = counselingStatusLabel(card.status, true, false) ?? card.status;
  const activeAuthoredSession = card.state.kind === "session";
  const sessionHeading = activeAuthoredSession
    ? `Session ${card.state.caseSession?.templateSequence ?? card.state.session?.number ?? 1}`
    : card.state.kind === "initial"
      ? "Initial Meeting"
      : presentation.sessionTitle;
  const sessionEyebrow = activeAuthoredSession
    ? "Current Session"
    : card.state.kind === "initial"
      ? "Session 0"
      : presentation.statusLabel;
  const sessionStatus = activeAuthoredSession
    ? "Current"
    : card.state.kind === "initial"
      ? card.state.meeting ? "Upcoming Meeting" : "Not Scheduled"
      : card.state.kind === "completed" ? "Completed" : presentation.statusLabel;
  const sessionStatusClass = card.state.kind === "completed"
    ? "bg-success-soft text-success-strong"
    : card.state.meeting ? "bg-info-soft text-info-strong" : "bg-surface-muted text-text-muted";
  const activeHomeworkRevisionId = card.state.caseSession?.status === "active"
    ? card.state.caseSession.homeworkAssignmentRevisionId
    : null;

  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <MeetingRealtime caseId={card.caseId} />
    <CaseLifecycleRealtime caseId={card.caseId} />
    {activeHomeworkRevisionId ? <HomeworkProgressRealtime assignmentRevisionId={activeHomeworkRevisionId} /> : null}
    <Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href="/workspace">Sessions</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{card.coupleName}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-6">
        <Card className="p-5 sm:p-7"><Link href={`/workspace/contacts/${card.caseId}/${card.coupleId}`} className="flex flex-col gap-5 rounded-md sm:flex-row sm:items-center"><PartnerPhotos card={card} /><div className="min-w-0"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Counseling case</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{card.coupleName}</h1><p className="mt-2 text-sm text-text-muted">Counseling Sessions and care details for this couple.</p></div></Link></Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{sessionEyebrow}</p>
              <h2 className="font-heading mt-2 text-xl font-bold text-text-primary">{sessionHeading}</h2>
              {activeAuthoredSession ? <p className="mt-1 text-base font-semibold text-text-secondary">{card.state.session?.title ?? card.state.detail}</p> : null}
              {card.state.kind === "initial" ? <p className="mt-2 max-w-xl text-sm text-text-muted">Review Prepare &amp; Enrich results and discuss the couple’s assessment and goals.</p> : activeAuthoredSession ? <p className="mt-2 text-sm text-text-muted">Session Material and Homework released together.</p> : null}
            </div>
            <Badge className={sessionStatusClass}>{sessionStatus}</Badge>
          </div>

          {card.state.meeting ? <div className="mt-5 flex items-start gap-3 rounded-md bg-info-soft/70 p-3 sm:p-4">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-info-strong" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Upcoming Meeting</p>
              <p className="mt-1 break-words text-sm font-semibold text-text-primary">{formatCounselingMeetingDateTime(card.state.meeting.startsAt)} · {card.state.meeting.location}</p>
            </div>
          </div> : null}

          {card.state.pastMeetings.length ? <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Previous Meetings</p>
            <ol className="mt-2 space-y-2">{card.state.pastMeetings.map((meeting, index) => <li key={meeting.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm"><span className="font-medium text-text-primary">Meeting {index + 1} · {meeting.completedAt ? "Completed" : "Scheduled"}</span><span className="text-text-muted">{formatCounselingMeetingDateTime(meeting.startsAt)}</span></li>)}</ol>
          </div> : null}

          <section aria-label="Homework" className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Homework</p>
            {card.homework ? <>
              <p className="mt-1 text-sm font-medium text-text-primary">{card.homework.title}</p>
              <ul className="mt-2 divide-y divide-border">{card.homework.partners.map((partner) => {
                const displayName = card.partners.find((casePartner) => casePartner.id === partner.profileId)?.name ?? partner.name;
                return <li key={partner.profileId} className="flex min-w-0 flex-col gap-3 py-3 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-semibold text-text-primary">{displayName}</p><Badge className={`mt-1.5 ${homeworkProgressBadgeClass(partner.status)}`}>{homeworkProgressLabel(partner.status)}</Badge></div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{partner.status === "submitted" || partner.status === "reviewed" ? <Link href={`/workspace/cases/${card.caseId}/homework/${partner.progressId}`} className="inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted">View Answers<span className="sr-only"> for {displayName}</span></Link> : null}{canReopenHomework && card.status === "active" && card.state.caseSession?.status === "active" && (partner.status === "submitted" || partner.status === "reviewed") ? <ReopenHomeworkButton caseId={card.caseId} progressId={partner.progressId} partnerName={displayName} /> : null}</div></li>;
              })}</ul>
            </> : <p className="mt-1 text-sm text-text-muted">{card.state.caseSession ? card.state.caseSession.homeworkAssignmentRevisionId ? "Homework status unavailable." : "No Homework for this Session" : "No homework assigned yet."}</p>}
          </section>

          {card.materialSessions.length ? <section aria-label="Session Materials" className="mt-4 border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Session Materials</h3>
            <ul className="mt-1 divide-y divide-border">{card.materialSessions.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-start gap-3 py-2 first:pt-1 last:pb-0">
              <ExportSessionMaterialsButton caseSessionId={session.id} sessionLabel={`Session ${session.templateSequence}: ${session.title}`} />
            </li>)}</ul>
          </section> : null}

          {card.state.meeting ? <>
            <MeetingNotificationRealtime meetingId={card.state.meeting.id} />
            <MeetingNotificationStatus partners={card.partners.map(({ id, firstName, name }) => ({ id, firstName, name }))} deliveries={meetingNotifications} />
          </> : null}
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Status</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{caseStatus}</p></Card>
        <PrepareEnrichCard caseId={card.caseId} document={prepareEnrich} />
        <SessionLifecycleControls card={{ caseId: card.caseId, coupleName: card.coupleName, state: card.state, publishedSessions: card.publishedSessions, homework: card.homework, isAdmin }} partners={card.partners.map(({ id, firstName, name }) => ({ id, firstName, name }))} deliveries={meetingNotifications} />
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Progress</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{presentation.progress}</p>{progressPercent !== null ? <div role="progressbar" aria-label="Counseling program progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)} className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-brand-primary" style={{ width: `${progressPercent}%` }} /></div> : null}</Card>
      </aside>
    </section>
    {canResetCounselingJourney ? <DevResetControl caseId={card.caseId} /> : null}
  </main>;
}
