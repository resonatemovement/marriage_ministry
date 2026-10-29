"use client";

import { useState, useTransition } from "react";

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
  return <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{scores.map((score) => <li key={score.label} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-surface-muted px-3 py-2 text-sm"><span className="font-medium text-text-primary">{score.label}{score.isPrimary ? <span className="ml-1.5 text-xs font-semibold text-brand-secondary">Primary</span> : null}</span><span className="tabular-nums text-text-secondary">{score.score}</span></li>)}</ul>;
}

function History({ history }: { history: CounselorAssessment["partners"][number]["history"] }) {
  if (!history.length) return null;
  return <details className="mt-3 rounded-md border border-border px-3 py-2"><summary className="cursor-pointer text-sm font-semibold text-text-primary">View score history ({history.length})</summary><ol className="mt-2 grid gap-3">{history.map((item) => <li key={item.attemptNumber} className="border-t border-border pt-2"><p className="text-xs text-text-muted">Attempt {item.attemptNumber} · {new Date(item.submittedAt).toLocaleDateString()}</p><Scores scores={item.scores} /></li>)}</ol></details>;
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

export function CounselorAssessmentManagement({ caseId, assessments, sessions, preferences, canReadResults, canManagePreference, activeCaseSessionId, completedSessionIds = [] }: {
  caseId: string;
  assessments: CounselorAssessment[];
  sessions: CounselorAssessmentSession[];
  preferences: Record<string, string>;
  canReadResults: boolean;
  canManagePreference: boolean;
  activeCaseSessionId: string | null;
  completedSessionIds?: string[];
}) {
  if (!assessments.length) return <section aria-label="Assessments" className="mt-4 border-t border-border pt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Assessments</h3><p className="mt-1 text-sm text-text-muted">No Assessments are configured.</p></section>;
  return <section aria-label="Assessments" className="mt-4 border-t border-border pt-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Assessments</h3>
    <div className="mt-2 grid gap-3">{assessments.map((assessment) => {
      const blocking = canReadResults && assessmentBlocksSessionAdvancement(assessment, activeCaseSessionId);
      return <Card key={assessment.id} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h4 className="font-heading text-base font-bold text-text-primary">{assessment.title}</h4>{assessment.description ? <p className="mt-1 text-sm text-text-muted">{assessment.description}</p> : null}</div><Badge className={assessment.schedule ? "bg-info-soft text-info-strong" : "bg-surface-muted text-text-muted"}>{assessment.schedule ? assessment.schedule.requiredForProgression ? "Required" : "Optional" : "Available"}</Badge></div>
        {!assessment.publishedVersionId && !assessment.schedule ? <p role="status" className="mt-3 rounded-md bg-surface-muted px-3 py-2 text-sm text-text-muted">No published version is available yet. This Assessment cannot be assigned until a usable version is published.</p> : <><CaseSchedule caseId={caseId} assessment={assessment} sessions={sessions} completedSessionIds={completedSessionIds} preferenceSessionId={preferences[assessment.id] ?? null} canManagePreference={canManagePreference} />{assessment.schedule && !assessment.publishedVersionId ? <p role="status" className="mt-2 text-xs text-text-muted">The existing pinned version remains available to participants; no new version is published for new assignments.</p> : null}</>}
        {assessment.schedule && canReadResults ? <div className="mt-4 border-t border-border pt-3"><h5 className="text-sm font-semibold text-text-primary">Partner status and results</h5>{blocking ? <p role="status" className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This Assessment is blocking Session advancement. Both partners must submit their initial attempt.</p> : null}<ul className="mt-2 grid gap-3 sm:grid-cols-2">{assessment.partners.map((partner) => <li key={partner.profileId} className="min-w-0 rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-text-primary">{partner.name}</p><Badge className={partner.status === "completed" ? "bg-success-soft text-success-strong" : "bg-amber-50 text-amber-900"}>{statusLabel(partner.status)}</Badge></div><Scores scores={partner.latestScores} /><History history={partner.history} /></li>)}</ul></div> : null}
        {assessment.schedule && !canReadResults ? <p className="mt-3 border-t border-border pt-3 text-sm text-text-muted">Partner completion status and results are available only to the assigned Counselor.</p> : null}
      </Card>;
    })}</div>
  </section>;
}
