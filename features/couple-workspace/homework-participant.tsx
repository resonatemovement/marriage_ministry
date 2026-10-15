"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Card } from "@/components/ui/card";
import { VideoLinkPreview } from "@/features/homework/homework-preview";
import { homeworkProgressLabel, type HomeworkProgressStatus } from "@/features/homework/presentation";
import { eligibleInternalNavigation } from "@/features/session-builder/navigation-guard";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import type { Json } from "@/types/database.generated";

import { persistParticipantHomework, type ParticipantHomeworkIntent } from "./homework-participant-actions";

export type ParticipantHomework = {
  title: string;
  status: HomeworkProgressStatus;
  progressId: string;
  blocks: { id: string; type: string; title: string | null; content: Json | null; url: string | null; description: string | null; answer: string }[];
};

export function participantAnswerValues(homework: ParticipantHomework) {
  return Object.fromEntries(homework.blocks.filter((block) => block.type === "long_answer").map((block) => [block.id, block.answer]));
}

export function participantAnswersAreDirty(answers: Record<string, string>, savedAnswers: Record<string, string>) {
  const keys = new Set([...Object.keys(answers), ...Object.keys(savedAnswers)]);
  return [...keys].some((key) => (answers[key] ?? "") !== (savedAnswers[key] ?? ""));
}

export function participantRequiredAnswerErrors(answers: Record<string, string>) {
  return Object.fromEntries(Object.entries(answers).filter(([, answer]) => !answer.trim()).map(([blockId]) => [blockId, "A response is required."]));
}

function HomeworkAssignment({ homework, readOnly, showHeader, onDirtyChange, onStatusChange }: {
  homework: ParticipantHomework;
  readOnly: boolean;
  showHeader: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onStatusChange?: (status: HomeworkProgressStatus) => void;
}) {
  const initialAnswers = useMemo(() => participantAnswerValues(homework), [homework]);
  const [answers, setAnswers] = useState(initialAnswers);
  const [savedAnswers, setSavedAnswers] = useState(initialAnswers);
  const [status, setStatus] = useState(homework.status);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = participantAnswersAreDirty(answers, savedAnswers);
  const locked = readOnly || status === "submitted" || status === "reviewed";

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const warnBeforeNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor) return;
      const destination = eligibleInternalNavigation({ href: anchor.href, currentHref: window.location.href, button: event.button, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, target: anchor.target, download: anchor.hasAttribute("download") });
      if (destination && !window.confirm("You have unsaved Homework changes. Leave without saving?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeNavigation, true);
    };
  }, [dirty]);

  function persist(intent: ParticipantHomeworkIntent) {
    const nextErrors = intent === "submit" ? participantRequiredAnswerErrors(answers) : {};
    setFieldErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length > 0) {
      setMessage({ kind: "error", text: "Please complete each required response before submitting." });
      return;
    }
    startTransition(async () => {
      const result = await persistParticipantHomework({ progressId: homework.progressId, answers, intent });
      if (!result.success) {
        setFieldErrors(result.fieldErrors);
        setMessage({ kind: "error", text: result.error ?? "Homework could not be saved." });
        return;
      }
      setSavedAnswers({ ...answers });
      if (result.status) {
        setStatus(result.status);
        onStatusChange?.(result.status);
      }
      setMessage({ kind: "success", text: intent === "save" ? "Draft saved" : "Homework submitted successfully" });
    });
  }

  return <section aria-label="Your Homework">
    {showHeader ? <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Session Homework</p><h2 className="font-heading mt-2 text-2xl font-bold text-text-primary">{homework.title}</h2><p className="mt-2 text-sm text-text-muted">Status: <span className="font-medium text-text-primary">{homeworkProgressLabel(status)}</span></p></header> : null}
    <form noValidate onSubmit={(event) => event.preventDefault()}>
      <div className="grid gap-4">{homework.blocks.map((block) => <Card key={block.id} className="p-5 sm:p-7">
        {block.type === "rich_text" && block.content && typeof block.content === "object" && !Array.isArray(block.content) ? <><h3 className="font-heading text-lg font-bold text-text-primary">{block.title}</h3><RichTextReadOnly content={block.content as Record<string, unknown>} compact /></> : block.type === "video_link" && block.title && block.url && block.description ? <VideoLinkPreview title={block.title} url={block.url} description={block.description} /> : block.type === "long_answer" && block.content && typeof block.content === "object" && !Array.isArray(block.content) ? <><RichTextReadOnly content={block.content as Record<string, unknown>} compact /><div className="mt-5 border-t border-border pt-4"><label htmlFor={`answer-${block.id}`} className="text-sm font-semibold text-text-primary">Your response <span className="font-normal text-text-muted">(required)</span></label><textarea id={`answer-${block.id}`} name={`answer-${block.id}`} value={answers[block.id] ?? ""} onChange={(event) => { const value = event.currentTarget.value; setAnswers((current) => ({ ...current, [block.id]: value })); setFieldErrors((current) => { const next = { ...current }; delete next[block.id]; return next; }); setMessage(null); }} readOnly={locked} rows={5} aria-invalid={Boolean(fieldErrors[block.id])} aria-describedby={fieldErrors[block.id] ? `answer-error-${block.id}` : undefined} className="mt-2 min-h-32 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary read-only:bg-surface-muted" />{fieldErrors[block.id] ? <p id={`answer-error-${block.id}`} className="mt-2 text-sm text-danger">{fieldErrors[block.id]}</p> : null}</div></> : <p className="text-sm text-text-muted">This Homework content is unavailable.</p>}
      </Card>)}</div>
      {locked ? <p className="mt-5 text-sm text-text-muted">Submitted Homework is read-only.</p> : <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => persist("save")} disabled={pending || !dirty} className="min-h-10 cursor-pointer rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save Draft"}</button><button type="button" onClick={() => persist("submit")} disabled={pending} className="min-h-10 cursor-pointer rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Submitting…" : "Submit Homework"}</button></div>}
      {message ? <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${message.kind === "error" ? "text-danger" : "text-success-strong"}`}>{message.text}</p> : null}
    </form>
  </section>;
}

export function ParticipantHomeworkContent({ homework, emptyTitle = "Your Homework", emptyDescription = "There is no active Homework assignment for your current Session.", readOnly = false, showHeader = true, onDirtyChange, onStatusChange }: {
  homework: ParticipantHomework | null;
  emptyTitle?: string;
  emptyDescription?: string;
  readOnly?: boolean;
  showHeader?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onStatusChange?: (status: HomeworkProgressStatus) => void;
}) {
  if (!homework) return <Card className="p-6"><h2 className="font-heading text-xl font-bold text-text-primary">{emptyTitle}</h2><p className="mt-2 text-sm text-text-muted">{emptyDescription}</p></Card>;
  return <HomeworkAssignment key={homework.progressId} homework={homework} readOnly={readOnly} showHeader={showHeader} onDirtyChange={onDirtyChange} onStatusChange={onStatusChange} />;
}

export function HomeworkParticipantPage({ homework }: { homework: ParticipantHomework | null }) {
  return <main id="homework-response" className="mx-auto max-w-3xl p-5 sm:p-8"><ParticipantHomeworkContent homework={homework} /></main>;
}
