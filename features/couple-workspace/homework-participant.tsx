"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { RadioGroup } from "radix-ui";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { VideoLinkPreview } from "@/features/homework/homework-preview";
import { homeworkProgressLabel, type HomeworkProgressStatus } from "@/features/homework/presentation";
import type { HomeworkAnswerChoice, HomeworkResponseValue } from "@/features/homework/selection-question";
import { eligibleInternalNavigation } from "@/features/session-builder/navigation-guard";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import type { Json } from "@/types/database.generated";

import { persistParticipantHomework, type ParticipantHomeworkIntent } from "./homework-participant-actions";
import { HomeworkProgressRealtime } from "@/features/counseling-sessions/homework-progress-realtime";

export type ParticipantHomeworkAnswer = HomeworkResponseValue;
export type ParticipantHomeworkAnswers = Record<string, ParticipantHomeworkAnswer>;
export type ParticipantHomeworkBlock = {
  id: string;
  type: string;
  title: string | null;
  content: Json | null;
  url: string | null;
  description: string | null;
  answer: ParticipantHomeworkAnswer;
  questionChoices: HomeworkAnswerChoice[];
  isRequired: boolean;
};

export type ParticipantHomework = {
  title: string;
  status: HomeworkProgressStatus;
  progressId: string;
  revisionId: string;
  blocks: ParticipantHomeworkBlock[];
};

const responseBlockTypes = new Set(["long_answer", "checkbox_question", "radio_question"]);

function cloneAnswers(answers: ParticipantHomeworkAnswers): ParticipantHomeworkAnswers {
  return Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, Array.isArray(answer) ? [...answer] : answer]));
}

export function participantAnswerValues(homework: ParticipantHomework): ParticipantHomeworkAnswers {
  return Object.fromEntries(homework.blocks
    .filter((block) => responseBlockTypes.has(block.type))
    .map((block) => [block.id, Array.isArray(block.answer) ? [...block.answer] : block.answer]));
}

export function participantAnswersAreDirty(answers: ParticipantHomeworkAnswers, savedAnswers: ParticipantHomeworkAnswers) {
  const keys = new Set([...Object.keys(answers), ...Object.keys(savedAnswers)]);
  return [...keys].some((key) => JSON.stringify(answers[key] ?? "") !== JSON.stringify(savedAnswers[key] ?? ""));
}

export function participantRequiredAnswerErrors(homework: ParticipantHomework, answers: ParticipantHomeworkAnswers) {
  return Object.fromEntries(homework.blocks.flatMap((block) => {
    const required = block.type === "long_answer" || ((block.type === "checkbox_question" || block.type === "radio_question") && block.isRequired);
    if (!required) return [];
    const answer = answers[block.id];
    const missing = Array.isArray(answer) ? answer.length === 0 : typeof answer !== "string" || !answer.trim();
    return missing ? [[block.id, "A response is required."]] : [];
  }));
}

export function nextCheckboxAnswer(current: ParticipantHomeworkAnswer | undefined, choiceId: string, checked: boolean, choices: HomeworkAnswerChoice[]) {
  const selected = new Set(Array.isArray(current) ? current : []);
  if (checked) selected.add(choiceId);
  else selected.delete(choiceId);
  return choices.map((choice) => choice.id).filter((id) => selected.has(id));
}

export function nextRadioAnswer(choiceId: string) {
  return choiceId;
}

function HomeworkSelectionQuestion({ block, answer, locked, error, onChange }: {
  block: ParticipantHomeworkBlock;
  answer: ParticipantHomeworkAnswer | undefined;
  locked: boolean;
  error?: string;
  onChange: (answer: ParticipantHomeworkAnswer) => void;
}) {
  if (!block.content || typeof block.content !== "object" || Array.isArray(block.content)) return <p className="text-sm text-text-muted">This Homework content is unavailable.</p>;
  const questionId = `question-${block.id}`;
  const errorId = `answer-error-${block.id}`;
  const selectedCheckboxes = Array.isArray(answer) ? answer : [];
  const selectedRadio = typeof answer === "string" ? answer : "";

  return <>
    <div id={questionId}><RichTextReadOnly content={block.content as Record<string, unknown>} compact contentClassName="p-0" /></div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold text-text-primary">Answer choices</p>
      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-muted">{block.isRequired ? "Required" : "Optional"}</span>
    </div>
    {block.type === "checkbox_question" ? <div role="group" aria-labelledby={questionId} aria-describedby={error ? errorId : undefined} className="mt-3 grid gap-3">
      {block.questionChoices.map((choice) => <label key={choice.id} className="flex min-h-8 cursor-pointer items-center gap-3 text-sm text-text-primary has-[:disabled]:cursor-not-allowed">
        <Checkbox checked={selectedCheckboxes.includes(choice.id)} disabled={locked} onCheckedChange={(checked) => onChange(nextCheckboxAnswer(selectedCheckboxes, choice.id, checked === true, block.questionChoices))} aria-label={choice.label} aria-invalid={Boolean(error)} />
        <span>{choice.label}</span>
      </label>)}
    </div> : <>
      <RadioGroup.Root name={`answer-${block.id}`} value={selectedRadio} disabled={locked} onValueChange={(choiceId) => onChange(nextRadioAnswer(choiceId))} aria-labelledby={questionId} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="mt-3 grid gap-3">
        {block.questionChoices.map((choice) => <div key={choice.id} className="flex min-h-8 items-center gap-3 text-sm text-text-primary">
          <RadioGroup.Item id={`answer-${block.id}-${choice.id}`} value={choice.id} aria-label={choice.label} className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-white outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20 disabled:cursor-not-allowed disabled:opacity-70">
            <RadioGroup.Indicator className="size-2 rounded-full bg-brand-primary" />
          </RadioGroup.Item>
          <label htmlFor={`answer-${block.id}-${choice.id}`} className="cursor-pointer">{choice.label}</label>
        </div>)}
      </RadioGroup.Root>
      {!block.isRequired && selectedRadio && !locked ? <button type="button" onClick={() => onChange("")} className="mt-3 min-h-10 cursor-pointer text-sm font-medium text-brand-secondary hover:text-brand-primary focus-visible:text-brand-primary">Clear selection</button> : null}
    </>}
    {error ? <p id={errorId} role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
  </>;
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

  function updateAnswer(blockId: string, answer: ParticipantHomeworkAnswer) {
    setAnswers((current) => ({ ...current, [blockId]: answer }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[blockId];
      return next;
    });
    setMessage(null);
  }

  function persist(intent: ParticipantHomeworkIntent) {
    const nextErrors = intent === "submit" ? participantRequiredAnswerErrors(homework, answers) : {};
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
        if (Object.keys(result.fieldErrors).length > 0) {
          setMessage({ kind: "error", text: result.error ?? "Please correct the highlighted responses." });
        } else {
          showErrorToast(result.error ?? (intent === "save" ? "Your draft could not be saved." : "Homework could not be submitted."));
        }
        return;
      }
      setSavedAnswers(cloneAnswers(answers));
      if (result.status) {
        setStatus(result.status);
        onStatusChange?.(result.status);
      }
      showSuccessToast(intent === "save" ? "Homework draft saved." : "Homework submitted successfully.");
    });
  }

  return <section aria-label="Your Homework">
    {showHeader ? <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Session Homework</p><h2 className="font-heading mt-2 text-2xl font-bold text-text-primary">{homework.title}</h2><p className="mt-2 text-sm text-text-muted">Status: <span className="font-medium text-text-primary">{homeworkProgressLabel(status)}</span></p></header> : null}
    <form noValidate onSubmit={(event) => event.preventDefault()}>
      <div className="grid gap-4">{homework.blocks.map((block) => <Card key={block.id} className="p-5 sm:p-7">
        {block.type === "rich_text" && block.content && typeof block.content === "object" && !Array.isArray(block.content) ? <><h3 className="font-heading text-lg font-bold text-text-primary">{block.title}</h3><RichTextReadOnly content={block.content as Record<string, unknown>} compact /></> : block.type === "video_link" && block.title && block.url && block.description ? <VideoLinkPreview title={block.title} url={block.url} description={block.description} /> : block.type === "long_answer" && block.content && typeof block.content === "object" && !Array.isArray(block.content) ? <><RichTextReadOnly content={block.content as Record<string, unknown>} compact contentClassName="p-0" /><div className="mt-5 border-t border-border pt-4"><label htmlFor={`answer-${block.id}`} className="text-sm font-semibold text-text-primary">Your response <span className="font-normal text-text-muted">(required)</span></label><textarea id={`answer-${block.id}`} name={`answer-${block.id}`} value={typeof answers[block.id] === "string" ? answers[block.id] : ""} onChange={(event) => updateAnswer(block.id, event.currentTarget.value)} readOnly={locked} rows={5} aria-invalid={Boolean(fieldErrors[block.id])} aria-describedby={fieldErrors[block.id] ? `answer-error-${block.id}` : undefined} className="mt-2 min-h-32 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary read-only:bg-surface-muted" />{fieldErrors[block.id] ? <p id={`answer-error-${block.id}`} role="alert" className="mt-2 text-sm text-danger">{fieldErrors[block.id]}</p> : null}</div></> : block.type === "checkbox_question" || block.type === "radio_question" ? <HomeworkSelectionQuestion block={block} answer={answers[block.id]} locked={locked} error={fieldErrors[block.id]} onChange={(answer) => updateAnswer(block.id, answer)} /> : <p className="text-sm text-text-muted">This Homework content is unavailable.</p>}
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
  return <HomeworkAssignment key={`${homework.progressId}-${homework.status}`} homework={homework} readOnly={readOnly} showHeader={showHeader} onDirtyChange={onDirtyChange} onStatusChange={onStatusChange} />;
}

export function HomeworkParticipantPage({ homework }: { homework: ParticipantHomework | null }) {
  return <main id="homework-response" className="mx-auto max-w-3xl p-5 sm:p-8">{homework ? <HomeworkProgressRealtime assignmentRevisionId={homework.revisionId} /> : null}<ParticipantHomeworkContent homework={homework} /></main>;
}
