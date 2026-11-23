"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ReopenHomeworkButton } from "./homework-reopen-button";
import type { CounselingSessionCard } from "./queries";
import { homeworkProgressBadgeClass, homeworkProgressLabel } from "@/features/homework/presentation";

export function initialHomeworkSessionSelection(sessions: CounselingSessionCard["homeworkSessions"], currentSessionId: string | null) {
  if (currentSessionId && sessions.some(({ caseSessionId }) => caseSessionId === currentSessionId)) return currentSessionId;
  return [...sessions].sort((left, right) => right.actualSequence - left.actualSequence)[0]?.caseSessionId ?? "";
}

export function HomeworkSessionBrowser({ card, canReopenHomework }: {
  card: CounselingSessionCard;
  canReopenHomework: boolean;
}) {
  const sessions = card.homeworkSessions;
  const currentSessionId = card.state.caseSession?.id ?? null;
  const [selectedCaseSessionId, setSelectedCaseSessionId] = useState(() => initialHomeworkSessionSelection(sessions, currentSessionId));
  const selectedSession = sessions.find(({ caseSessionId }) => caseSessionId === selectedCaseSessionId) ?? null;
  const orderedSessions = [...sessions].sort((left, right) => {
    const leftCurrent = left.caseSessionId === currentSessionId && left.status === "active";
    const rightCurrent = right.caseSessionId === currentSessionId && right.status === "active";
    return Number(rightCurrent) - Number(leftCurrent) || right.actualSequence - left.actualSequence;
  });

  if (sessions.length === 0) {
    return <section aria-label="Homework by Session" className="grid gap-3">
      <h2 className="font-heading text-lg font-bold text-text-primary">Homework by Session</h2>
      <p className="text-sm text-text-muted">No counseling Sessions have been started yet.</p>
    </section>;
  }

  return <section aria-label="Homework by Session" className="grid gap-4">
    <div>
      <h2 className="font-heading text-lg font-bold text-text-primary">Homework by Session</h2>
      <p className="mt-1 text-sm text-text-muted">Select a Session to review its saved Homework status and available answers.</p>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
      <nav aria-label="Select a Session to review Homework" className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {orderedSessions.map((session) => {
          const isCurrent = session.caseSessionId === currentSessionId && session.status === "active";
          const isSelected = session.caseSessionId === selectedCaseSessionId;
          return <button
            key={session.caseSessionId}
            type="button"
            aria-pressed={isSelected}
            onClick={() => setSelectedCaseSessionId(session.caseSessionId)}
            className={`min-w-44 shrink-0 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:brightness-95 lg:min-w-0 ${isSelected ? "border-brand-primary bg-brand-primary/5" : "border-border bg-white hover:bg-surface-muted"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-text-primary">Session {session.templateSequence}</span>
              {isCurrent ? <Badge className="bg-info-soft text-info-strong">Current</Badge> : null}
            </span>
            <span className="mt-1 block truncate text-sm text-text-secondary">{session.title}</span>
            {!session.revisionAssigned ? <span className="mt-1 block text-xs text-text-muted">No Homework assigned</span> : null}
          </button>;
        })}
      </nav>

      {selectedSession ? <div className="min-w-0 rounded-md border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{selectedSession.status === "active" ? "Counseling Session" : "Completed Counseling Session"}</p>
            <h3 className="font-heading mt-1 break-words text-lg font-bold text-text-primary">Session {selectedSession.templateSequence}: {selectedSession.title}</h3>
          </div>
          {selectedSession.caseSessionId === currentSessionId && selectedSession.status === "active" ? <Badge className="bg-info-soft text-info-strong">Current</Badge> : null}
        </div>
        {!selectedSession.revisionAssigned ? <p className="mt-4 text-sm text-text-muted">No Homework was assigned for this Session.</p>
          : selectedSession.partners ? <ul className="mt-3 divide-y divide-border">
            {selectedSession.partners.map((partner) => {
              const displayName = card.partners.find(({ id }) => id === partner.profileId)?.name ?? partner.name;
              const submitted = partner.status === "submitted" || partner.status === "reviewed";
              const canReopen = canReopenHomework
                && selectedSession.caseSessionId === currentSessionId
                && selectedSession.status === "active"
                && card.status === "active"
                && submitted;
              return <li key={partner.profileId} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-text-primary">{displayName}</p>
                  <Badge className={`mt-1.5 ${homeworkProgressBadgeClass(partner.status)}`}>{homeworkProgressLabel(partner.status)}</Badge>
                </div>
                <div className="flex shrink-0 items-center">
                  {submitted || canReopen ? <ReopenHomeworkButton
                    caseId={card.caseId}
                    progressId={partner.progressId}
                    partnerName={displayName}
                    viewAnswersHref={submitted ? `/workspace/cases/${card.caseId}/homework/${partner.progressId}` : undefined}
                    canReopen={canReopen}
                  /> : null}
                </div>
              </li>;
            })}
          </ul>
          : <p className="mt-4 text-sm text-text-muted">Homework status is unavailable.</p>}
      </div> : null}
    </div>
  </section>;
}
