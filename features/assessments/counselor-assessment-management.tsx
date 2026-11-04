"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { rescheduleCaseAssessment, saveCaseAssessmentSchedule, saveCounselorAssessmentPreference } from "./counselor-management-actions";
import { assessmentBlocksSessionAdvancement, type CounselorAssessment, type CounselorAssessmentSession } from "./counselor-management-model";

function statusLabel(status: CounselorAssessment["partners"][number]["status"]) {
  return status === "completed" ? "Submitted" : status === "in_progress" ? "In Progress" : status === "not_started" ? "Not Started" : "Not Assigned";
}

function Scores({ scores }: { scores: CounselorAssessment["partners"][number]["latestScores"] }) {
  if (!scores.length) return <p className="mt-2 text-sm text-text-muted">No completed results yet.</p>;
  return <ul className="mt-2 space-y-2">{scores.map((score) => <li key={score.label} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2 text-sm"><span className="min-w-0 font-medium text-text-primary">{score.label}{score.isPrimary ? <span className="ml-1.5 text-xs font-semibold text-brand-secondary">Primary</span> : null}</span><span className="shrink-0 tabular-nums text-text-secondary">{score.score}</span></li>)}</ul>;
}

export function AssessmentResultsContent({ assessment }: { assessment: CounselorAssessment }) {
  return <div className="grid gap-4 md:grid-cols-2">{assessment.partners.map((partner) => <article key={partner.profileId} className="min-w-0 rounded-lg border border-border bg-surface p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-heading min-w-0 text-base font-bold text-text-primary">{partner.name}</h3><Badge className={partner.status === "completed" ? "bg-success-soft text-success-strong" : "bg-amber-50 text-amber-900"}>{statusLabel(partner.status)}</Badge></div>
    <Scores scores={partner.latestScores} />
  </article>)}</div>;
}

function primaryResults(assessment: CounselorAssessment) {
  return assessment.partners.flatMap((partner) => {
    const labels = partner.latestScores.filter((score) => score.isPrimary).map(({ label }) => label);
    return labels.length ? [{ name: partner.name, labels }] : [];
  });
}

function AssessmentPrimarySummary({ assessment }: { assessment: CounselorAssessment }) {
  const results = primaryResults(assessment);
  return results.length ? <ul className="mt-2 grid gap-1 text-sm text-text-secondary sm:grid-cols-2 sm:gap-3" aria-label="Primary results">
    {results.map(({ name, labels }) => <li key={name}><span className="font-semibold text-text-primary">{name}:</span> {labels.join(", ")}</li>)}
  </ul> : null;
}

function AssessmentResultsDialog({ assessment }: { assessment: CounselorAssessment }) {
  const [open, setOpen] = useState(false);

  return <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button type="button" aria-haspopup="dialog" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary/90 focus-visible:bg-brand-primary/90">View Results</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed inset-x-3 top-1/2 z-50 flex max-h-[90dvh] -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-background shadow-xl sm:left-1/2 sm:right-auto sm:w-[min(880px,calc(100vw-2rem))] sm:-translate-x-1/2">
          <div className="relative shrink-0 border-b border-border px-5 py-4 pr-14 sm:px-6 sm:py-5">
            <Dialog.Title className="font-heading text-lg font-bold text-text-primary">{assessment.title} Results</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-text-muted">Partner submission status and available scores.</Dialog.Description>
            <Dialog.Close aria-label="Close results" className="absolute right-3 top-3 grid size-9 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent sm:right-4 sm:top-4"><X className="size-4" aria-hidden="true" /></Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6"><AssessmentResultsContent assessment={assessment} /></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>;
}

function CaseSchedule({ caseId, assessment, sessions, completedSessionIds, preferenceSessionId, canManagePreference }: {
  caseId: string;
  assessment: CounselorAssessment;
  sessions: CounselorAssessmentSession[];
  completedSessionIds: string[];
  preferenceSessionId: string | null;
  canManagePreference: boolean;
}) {
  const { schedule, publishedVersionId, systemDefaultSessionId } = assessment;
  const initialSessionId = schedule?.sessionId ?? preferenceSessionId ?? systemDefaultSessionId ?? sessions[0]?.id ?? "";
  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [preferenceSession, setPreferenceSession] = useState(preferenceSessionId ?? systemDefaultSessionId ?? sessions[0]?.id ?? "");
  const [savedPreference, setSavedPreference] = useState(preferenceSession);
  const [pending, startTransition] = useTransition();
  const caseSessions = sessions.filter((session) => !completedSessionIds.includes(session.id) || session.id === schedule?.sessionId);
  const currentSession = caseSessions.find((session) => session.id === selectedSessionId);
  const defaultSessionId = preferenceSessionId ?? systemDefaultSessionId;
  const selectedIsCurrent = schedule?.sessionId === selectedSessionId;
  const canSchedule = Boolean((schedule || publishedVersionId) && selectedSessionId && currentSession && !selectedIsCurrent);

  function saveSchedule() {
    if (schedule) {
      startTransition(async () => {
        const result = await rescheduleCaseAssessment(caseId, assessment.id, selectedSessionId);
        if (result.error) showErrorToast(result.error);
        else showSuccessToast("Assessment schedule saved. Existing participant progress was preserved.");
      });
      return;
    }
    if (!publishedVersionId) return;
    startTransition(async () => {
      const targetSessionId = !schedule && selectedSessionId === defaultSessionId ? null : selectedSessionId;
      const result = await saveCaseAssessmentSchedule(caseId, assessment.id, publishedVersionId, targetSessionId);
      if (result.error) showErrorToast(result.error);
      else showSuccessToast("Assessment schedule saved.");
    });
  }

  function savePreference() {
    if (!preferenceSession) return;
    startTransition(async () => {
      const result = await saveCounselorAssessmentPreference(assessment.id, preferenceSession);
      if (result.error) showErrorToast(result.error);
      else {
        setSavedPreference(preferenceSession);
        showSuccessToast("Default Assessment Session saved for future Cases.");
      }
    });
  }

  return <div className="mt-4 grid gap-4 rounded-md bg-surface-muted/60 p-3 sm:grid-cols-2">
    <div className="grid content-start gap-2">
      <label htmlFor={`assessment-session-${assessment.id}`} className="text-sm font-semibold text-text-primary">Case Session</label>
      <Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={!publishedVersionId || pending}>
        <SelectTrigger id={`assessment-session-${assessment.id}`} aria-label={`Session for ${assessment.title}`} className="w-full bg-surface"><SelectValue placeholder="Select a Session" /></SelectTrigger>
      <SelectContent>{caseSessions.map((session) => <SelectItem key={session.id} value={session.id}>Session {session.sequenceNumber}: {session.title}</SelectItem>)}</SelectContent>
      </Select>
      {schedule ? <p className="text-xs text-text-muted">Current schedule: {sessions.find(({ id }) => id === schedule.sessionId)?.title ?? "Session"} · {schedule.source.replaceAll("_", " ")}</p> : <p className="text-xs text-text-muted">Recommended default: {sessions.find(({ id }) => id === (preferenceSessionId ?? systemDefaultSessionId))?.title ?? "Session 1"}. Choosing another Session creates a Case-specific schedule.</p>}
      <button type="button" onClick={saveSchedule} disabled={!canSchedule || pending} className="min-h-10 w-fit rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary/90 focus-visible:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : schedule ? "Save Session" : "Assign Assessment"}</button>
    </div>
    {canManagePreference ? <div className="grid content-start gap-2">
      <label htmlFor={`assessment-default-${assessment.id}`} className="text-sm font-semibold text-text-primary">My default for future Cases</label>
      <Select value={preferenceSession} onValueChange={setPreferenceSession} disabled={pending}>
        <SelectTrigger id={`assessment-default-${assessment.id}`} aria-label={`Default Session for future ${assessment.title} assignments`} className="w-full bg-surface"><SelectValue placeholder="Select a Session" /></SelectTrigger>
        <SelectContent>{sessions.map((session) => <SelectItem key={session.id} value={session.id}>Session {session.sequenceNumber}: {session.title}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-xs text-text-muted">This only affects future Case schedules. Existing Case schedules stay unchanged.</p>
      <button type="button" onClick={savePreference} disabled={!preferenceSession || preferenceSession === savedPreference || pending} className="min-h-10 w-fit rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-muted focus-visible:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">Save Default</button>
    </div> : null}
  </div>;
}

export function CounselorAssessmentManagement({ caseId, assessments, sessions, preferences, canReadResults, canManageSchedule, canManagePreference, activeCaseSessionId, completedSessionIds = [] }: {
  caseId: string;
  assessments: CounselorAssessment[];
  sessions: CounselorAssessmentSession[];
  preferences: Record<string, string>;
  canReadResults: boolean;
  canManageSchedule: boolean;
  canManagePreference: boolean;
  activeCaseSessionId: string | null;
  completedSessionIds?: string[];
}) {
  if (!assessments.length) return <section aria-label="Assessments" className="mt-4 border-t border-border pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Assessments</h3><p className="mt-1 text-sm text-text-muted">No Assessments are configured.</p></section>;
  return <section aria-label="Assessments" className="mt-4 border-t border-border pt-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Assessments</h3>
    <div className="mt-2 grid gap-2">{assessments.map((assessment) => {
      const blocking = canReadResults && assessmentBlocksSessionAdvancement(assessment, activeCaseSessionId);
      const scheduledSession = assessment.schedule
        ? sessions.find(({ id }) => id === assessment.schedule?.sessionId)
        : null;
      const completion = assessment.partners.filter((partner) => partner.status === "completed").length;
      return <Card key={assessment.id} className="p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h4 className="font-heading text-base font-bold text-text-primary">{assessment.title}</h4><p className="mt-1 text-sm text-text-muted">{assessment.schedule ? `Session ${scheduledSession?.sequenceNumber ?? ""}${scheduledSession ? `: ${scheduledSession.title}` : ""}` : "Not scheduled"}</p></div><Badge className={assessment.schedule?.requiredForProgression ? "bg-info-soft text-info-strong" : "bg-surface-muted text-text-muted"}>{assessment.schedule ? assessment.schedule.requiredForProgression ? "Required" : "Optional" : "Available"}</Badge></div>
        {assessment.schedule && canReadResults ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="text-text-secondary">{completion} of {assessment.partners.length} submitted</span>{blocking ? <Badge className="bg-amber-50 text-amber-900">Blocking Session advancement</Badge> : null}</div> : null}
        {canReadResults && assessment.schedule ? <AssessmentPrimarySummary assessment={assessment} /> : null}
        {canReadResults && assessment.schedule ? <AssessmentResultsDialog assessment={assessment} /> : null}
        {canManageSchedule ? <details className="mt-3 border-t border-border pt-2">
          <summary className="min-h-9 cursor-pointer py-2 text-sm font-semibold text-brand-secondary">Scheduling Settings</summary>
          {!assessment.publishedVersionId && !assessment.schedule ? <p role="status" className="mt-2 rounded-md bg-surface-muted px-3 py-2 text-sm text-text-muted">No published version is available yet. This Assessment cannot be assigned until a usable version is published.</p> : <><CaseSchedule caseId={caseId} assessment={assessment} sessions={sessions} completedSessionIds={completedSessionIds} preferenceSessionId={preferences[assessment.id] ?? null} canManagePreference={canManagePreference} />{assessment.schedule && !assessment.publishedVersionId ? <p role="status" className="mt-2 text-xs text-text-muted">The existing pinned version remains available to participants; no new version is published for new assignments.</p> : null}</>}
        </details> : null}
        {assessment.schedule && !canReadResults ? <p className="mt-2 text-sm text-text-muted">Partner completion status and results are unavailable in this view.</p> : null}
      </Card>;
    })}</div>
  </section>;
}
