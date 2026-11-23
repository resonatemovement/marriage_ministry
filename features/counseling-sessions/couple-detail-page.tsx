import Link from "next/link";

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
import { CounselorAssessmentCards, CounselorAssessmentSchedulingSettings } from "@/features/assessments/counselor-assessment-management";
import { assessmentBlocksSessionAdvancement, type CounselorAssessment, type CounselorAssessmentSession } from "@/features/assessments/counselor-management-model";
import { orderCouplePartners } from "@/features/people/partner-order";
import { CaseDetailTabs } from "./case-detail-tabs";
import { HomeworkSessionBrowser } from "./homework-session-browser";

function PartnerPhotos({ card }: { card: CounselingSessionCard }) {
  return <GroupedAvatars people={couplePhotoSlots(card.partners)} label={`${card.coupleName} partner photos`} />;
}

function PrepareEnrichCard({ caseId, document }: { caseId: string; document: PrepareEnrichDocument | null }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Prepare &amp; Enrich</p><p className="font-heading mt-2 text-base font-bold text-text-primary">Counselor Copy</p>{document ? <><p className="mt-1 break-all text-sm text-text-muted">{document.fileName}</p><a href={`/workspace/cases/${caseId}/prepare-enrich`} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90">View / Download</a></> : <p className="mt-1 text-sm text-text-muted">No document uploaded.</p>}</Card>;
}

type MeetingNotificationRow = MeetingNotificationDelivery;

export function CounselingCoupleDetailPage({ card, prepareEnrich = null, assessmentManagement = null, assessmentPartnerOrder = [], canManageAssessmentSchedule = false, canManageAssessmentPreference = false, canReadAssessmentResults = false, isAdmin = false, canReopenHomework = false, canResetCounselingJourney = false, meetingNotifications = [], showCoupleContactLink = true }: { card: CounselingSessionCard; prepareEnrich?: PrepareEnrichDocument | null; assessmentManagement?: { assessments: CounselorAssessment[]; sessions: CounselorAssessmentSession[]; preferences: Record<string, string> } | null; assessmentPartnerOrder?: { id: string; name: string; gender: "male" | "female" | null }[]; canManageAssessmentSchedule?: boolean; canManageAssessmentPreference?: boolean; canReadAssessmentResults?: boolean; isAdmin?: boolean; canReopenHomework?: boolean; canResetCounselingJourney?: boolean; meetingNotifications?: MeetingNotificationRow[]; showCoupleContactLink?: boolean }) {
  const presentation = counselingSessionPresentation(card.state);
  const progressPercent = counselingProgressPercent(presentation.progress, card.state.kind === "completed");
  const caseStatus = counselingStatusLabel(card.status, true, false) ?? card.status;
  const activeAuthoredSession = card.state.kind === "session";
  const currentSessionNumber = card.state.caseSession?.templateSequence ?? card.state.session?.number ?? null;
  const currentSessionTitle = activeAuthoredSession
    ? `Session ${currentSessionNumber ?? 1}: ${card.state.caseSession?.title ?? card.state.session?.title ?? "In Progress"}`
    : card.state.kind === "initial" ? "Initial Meeting" : "No active Session";
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
  const activeCaseSessionId = card.state.caseSession?.status === "active" ? card.state.caseSession.id : null;
  const assessmentPrerequisites = assessmentManagement && activeCaseSessionId
    ? assessmentManagement.assessments.filter((assessment) => assessmentBlocksSessionAdvancement(assessment, activeCaseSessionId)).map((assessment) => ({
      id: assessment.id,
      title: assessment.title,
      partners: orderCouplePartners(card.partners.map((partner) => ({
        profileId: partner.id,
        name: partner.name,
        gender: partner.gender ?? null,
        status: assessment.partners.find(({ profileId }) => profileId === partner.id)?.status ?? "not_assigned" as const,
      }))),
    }))
    : assessmentManagement ? [] : null;
  const coupleIdentityContent = <>
    <PartnerPhotos card={card} />
    <div className="min-w-0">
      <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Counseling case</p>
      <h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{card.coupleName}</h1>
      <p className="mt-2 text-sm text-text-muted">Counseling Sessions and care details for this couple.</p>
    </div>
  </>;
  const upcomingMeeting = card.state.meeting;
  const sessionMaterialItems = [...card.materialSessions].sort((left, right) => {
    if (left.id === activeCaseSessionId) return -1;
    if (right.id === activeCaseSessionId) return 1;
    return left.actualSequence - right.actualSequence;
  });
  const sessionTab = <div className="grid gap-4">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current Session</p><h2 className="font-heading mt-1 break-words text-xl font-bold text-text-primary">{currentSessionTitle}</h2>{activeAuthoredSession ? <p className="mt-1 text-sm text-text-muted">{presentation.progress}</p> : null}</div>
        <Badge className={sessionStatusClass}>{sessionStatus}</Badge>
      </div>
      {upcomingMeeting ? <div className="mt-4 rounded-md bg-info-soft/70 p-3 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Upcoming Meeting</p><p className="mt-1 break-words text-sm font-semibold text-text-primary">{formatCounselingMeetingDateTime(upcomingMeeting.startsAt)} · {upcomingMeeting.location}</p></div> : <p className="mt-3 text-sm text-text-muted">No upcoming meeting is scheduled.</p>}
    </Card>
    <Card className="p-5" aria-label="Session Materials">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Session Materials</h2>
      {sessionMaterialItems.length ? <ul className="mt-2 divide-y divide-border">{sessionMaterialItems.map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
        <span className="min-w-0 break-words text-sm font-semibold text-text-primary">Session {session.templateSequence}: {session.title}{session.id === activeCaseSessionId ? " · Current" : ""}</span>
        <ExportSessionMaterialsButton caseSessionId={session.id} sessionLabel={`Session ${session.templateSequence}: ${session.title}`} />
      </li>)}</ul> : <p className="mt-2 text-sm text-text-muted">No Session Materials are available.</p>}
    </Card>
    <Card className="p-5" aria-label="Current Session Homework summary">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Homework Status</h2>
      {card.homework ? <><p className="mt-1 text-sm font-medium text-text-primary">{card.homework.title}</p><ul className="mt-2 divide-y divide-border">{card.homework.partners.map((partner) => <li key={partner.profileId} className="flex items-center justify-between gap-3 py-2 last:pb-0"><span className="min-w-0 break-words text-sm font-medium text-text-primary">{card.partners.find(({ id }) => id === partner.profileId)?.name ?? partner.name}</span><Badge className={homeworkProgressBadgeClass(partner.status)}>{homeworkProgressLabel(partner.status)}</Badge></li>)}</ul></> : <p className="mt-1 text-sm text-text-muted">{card.state.caseSession ? card.state.caseSession.homeworkAssignmentRevisionId ? "Homework status unavailable." : "No Homework for this Session." : "No Homework has been assigned yet."}</p>}
    </Card>
  </div>;
  const meetingsTab = <div className="grid gap-4">
    <Card className="p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Meetings</h2>
      {upcomingMeeting ? <div className="mt-3 rounded-md bg-info-soft/70 p-3 sm:p-4"><p className="text-xs font-semibold uppercase tracking-wide text-info-strong">Upcoming Meeting</p><p className="mt-1 break-words text-sm font-semibold text-text-primary">{formatCounselingMeetingDateTime(upcomingMeeting.startsAt)} · {upcomingMeeting.location}</p></div> : <p className="mt-2 text-sm text-text-muted">No upcoming meeting is scheduled.</p>}
      {card.state.pastMeetings.length ? <div className="mt-4 border-t border-border pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Meeting History</h3><ol className="mt-2 divide-y divide-border">{card.state.pastMeetings.map((meeting, index) => <li key={meeting.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm"><span className="font-medium text-text-primary">Meeting {index + 1} · {meeting.completedAt ? "Completed" : "Scheduled"}</span><span className="text-text-muted">{formatCounselingMeetingDateTime(meeting.startsAt)} · {meeting.location}</span></li>)}</ol></div> : <p className="mt-3 border-t border-border pt-3 text-sm text-text-muted">No previous meetings.</p>}
    </Card>
    {upcomingMeeting ? <Card className="p-5"><MeetingNotificationRealtime meetingId={upcomingMeeting.id} /><MeetingNotificationStatus partners={card.partners.map(({ id, firstName, name }) => ({ id, firstName, name }))} deliveries={meetingNotifications} compact /></Card> : <Card className="p-5"><h2 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Invitations &amp; Reminders</h2><p className="mt-2 text-sm text-text-muted">Delivery history is available when a Meeting has been scheduled.</p></Card>}
  </div>;
  const settingsTab = !assessmentManagement ? <p className="text-sm text-text-muted">Assessment scheduling settings are unavailable.</p>
    : !canManageAssessmentSchedule ? <p className="text-sm text-text-muted">Assessment scheduling settings are not available in this workspace.</p>
      : assessmentManagement.assessments.length === 0 ? <p className="text-sm text-text-muted">No Assessment schedules are available.</p>
        : <CounselorAssessmentSchedulingSettings caseId={card.caseId} assessments={assessmentManagement.assessments} sessions={assessmentManagement.sessions} preferences={assessmentManagement.preferences} canManageSchedule={canManageAssessmentSchedule} canManagePreference={canManageAssessmentPreference} completedSessionIds={card.materialSessions.filter(({ status }) => status === "completed").map(({ sessionId }) => sessionId)} />;

  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <MeetingRealtime caseId={card.caseId} />
    <CaseLifecycleRealtime caseId={card.caseId} />
    {activeHomeworkRevisionId ? <HomeworkProgressRealtime assignmentRevisionId={activeHomeworkRevisionId} /> : null}
    <Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href="/workspace">Sessions</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{card.coupleName}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <section className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-6">
      <div className="min-w-0 space-y-4">
        <Card className="p-5">
          {showCoupleContactLink ? <Link href={`/workspace/contacts/${card.caseId}/${card.coupleId}`} className="flex min-w-0 flex-col gap-4 rounded-md sm:flex-row sm:items-center">{coupleIdentityContent}</Link> : <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">{coupleIdentityContent}</div>}
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Status</p><p className="mt-1 truncate text-sm font-semibold text-text-primary">{caseStatus}</p></div>
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current Session</p><p className="mt-1 truncate text-sm font-semibold text-text-primary">{currentSessionTitle}</p></div>
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Upcoming Meeting</p><p className="mt-1 truncate text-sm font-semibold text-text-primary">{upcomingMeeting ? `${formatCounselingMeetingDateTime(upcomingMeeting.startsAt)} · ${upcomingMeeting.location}` : "Not scheduled"}</p></div>
          </div>
        </Card>
        <Card className="min-w-0 p-5"><CaseDetailTabs session={sessionTab} homework={<HomeworkSessionBrowser key={activeCaseSessionId ?? "no-active-session"} card={card} canReopenHomework={canReopenHomework} />} meetings={meetingsTab} settings={settingsTab} /></Card>
      </div>

      <aside className="min-w-0 space-y-4">
        <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Progress</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{presentation.progress}</p>{progressPercent !== null ? <div role="progressbar" aria-label="Counseling program progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)} className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-brand-primary" style={{ width: `${progressPercent}%` }} /></div> : null}</Card>
        {assessmentManagement ? <CounselorAssessmentCards assessments={assessmentManagement.assessments} canReadResults={canReadAssessmentResults} activeCaseSessionId={card.state.caseSession?.status === "active" ? card.state.caseSession.id : null} partnerOrder={assessmentPartnerOrder} /> : null}
        <PrepareEnrichCard caseId={card.caseId} document={prepareEnrich} />
        <SessionLifecycleControls card={{ caseId: card.caseId, coupleName: card.coupleName, state: card.state, publishedSessions: card.publishedSessions, homework: card.homework, isAdmin }} partners={card.partners.map(({ id, firstName, name }) => ({ id, firstName, name }))} deliveries={meetingNotifications} assessmentPrerequisites={assessmentPrerequisites} heading="Case Actions" />
      </aside>
    </section>
    {canResetCounselingJourney ? <DevResetControl caseId={card.caseId} /> : null}
  </main>;
}
