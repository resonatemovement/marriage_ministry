"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { RadioGroup } from "radix-ui";

import { Card } from "@/components/ui/card";
import { PageNavigation } from "@/components/shared/page-navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { VideoLinkPreview } from "@/features/homework/homework-preview";
import { homeworkProgressLabel, type HomeworkProgressStatus } from "@/features/homework/presentation";
import type { HomeworkAnswerChoice, HomeworkResponseValue } from "@/features/homework/selection-question";
import type { HomeworkPage } from "@/features/homework/homework-editor-model";
import { eligibleInternalNavigation } from "@/features/session-builder/navigation-guard";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import type { Json } from "@/types/database.generated";
import { sideBySideAnswerColumn, sideBySideAnswerRows, type SideBySideAnswerRow, type SideBySideResponseConfig, type SideBySideResponseSide } from "@/features/homework/side-by-side-response";
import { SideBySideResponseFields } from "@/features/homework/side-by-side-response-fields";

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
  sideBySideConfig?: Omit<SideBySideResponseConfig, "side"> | null;
  sideBySideResponseIds?: { left: string; right: string } | null;
  sideBySideRows?: SideBySideAnswerRow[] | null;
  pageId?: string;
};

export type ParticipantHomework = {
  title: string;
  status: HomeworkProgressStatus;
  progressId: string;
  revisionId: string;
  blocks: ParticipantHomeworkBlock[];
  pages?: HomeworkPage[];
};

const responseBlockTypes = new Set(["long_answer", "checkbox_question", "radio_question"]);

function cloneAnswers(answers: ParticipantHomeworkAnswers): ParticipantHomeworkAnswers {
  return Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, Array.isArray(answer) ? [...answer] : answer]));
}

export function participantAnswerValues(homework: ParticipantHomework): ParticipantHomeworkAnswers {
  return Object.fromEntries(homework.blocks.flatMap((block) => {
    if (block.type === "side_by_side_response" && block.sideBySideResponseIds) {
      const legacyAnswer = typeof block.answer === "object" && !Array.isArray(block.answer) ? block.answer : null;
      const rows = block.sideBySideRows ?? [{ id: block.sideBySideConfig?.groupId ?? block.id,
        left: legacyAnswer?.left ?? "", right: legacyAnswer?.right ?? "" }];
      return [
        [block.sideBySideResponseIds.left, sideBySideAnswerColumn(rows, "left")],
        [block.sideBySideResponseIds.right, sideBySideAnswerColumn(rows, "right")],
      ];
    }
    if (!responseBlockTypes.has(block.type)) return [];
    return [[block.id, Array.isArray(block.answer) ? [...block.answer] : block.answer as string]];
  }));
}

export function participantAnswersAreDirty(answers: ParticipantHomeworkAnswers, savedAnswers: ParticipantHomeworkAnswers) {
  const keys = new Set([...Object.keys(answers), ...Object.keys(savedAnswers)]);
  return [...keys].some((key) => JSON.stringify(answers[key] ?? "") !== JSON.stringify(savedAnswers[key] ?? ""));
}

export function participantRequiredAnswerErrors(homework: ParticipantHomework, answers: ParticipantHomeworkAnswers) {
  return Object.fromEntries(homework.blocks.flatMap((block) => {
    if (block.type === "side_by_side_response" && block.sideBySideResponseIds) {
      if (!block.sideBySideConfig?.bothRequired) return [];
      const rows = sideBySideAnswerRows(
        typeof answers[block.sideBySideResponseIds.left] === "string" ? answers[block.sideBySideResponseIds.left] as string : "",
        typeof answers[block.sideBySideResponseIds.right] === "string" ? answers[block.sideBySideResponseIds.right] as string : "",
        block.sideBySideConfig.groupId,
      );
      const invalid = rows.some((row) => Boolean(row.left.trim() || row.right.trim()) && !(row.left.trim() && row.right.trim()))
        || !rows.some((row) => Boolean(row.left.trim() && row.right.trim()));
      const errors: [string, string][] = invalid ? [
        [block.sideBySideResponseIds.left, "Complete both responses in each started pair. At least one complete pair is required."],
        [block.sideBySideResponseIds.right, "Complete both responses in each started pair. At least one complete pair is required."],
      ] : [];
      return errors;
    }
    const required = block.type === "long_answer" || ((block.type === "checkbox_question" || block.type === "radio_question") && block.isRequired);
    if (!required) return [];
    const answer = answers[block.id];
    const missing = Array.isArray(answer) ? answer.length === 0 : typeof answer !== "string" || !answer.trim();
    return missing ? [[block.id, "A response is required."]] : [];
  }));
}

function richTextPrompt(value: Json | null | undefined): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.map(richTextPrompt).filter(Boolean).join(" ");
  if (value.type === "text" && typeof value.text === "string") return value.text;
  return Object.values(value).map(richTextPrompt).filter(Boolean).join(" ");
}

export function participantMissingRequirements(homework: ParticipantHomework, answers: ParticipantHomeworkAnswers) {
  const errors = participantRequiredAnswerErrors(homework, answers);
  return homework.blocks.flatMap((block) => {
    if (block.type === "side_by_side_response" && block.sideBySideResponseIds && block.sideBySideConfig) {
      return errors[block.sideBySideResponseIds.left] || errors[block.sideBySideResponseIds.right]
        ? [`${block.sideBySideConfig.leftHeading} / ${block.sideBySideConfig.rightHeading}`]
        : [];
    }
    if (!errors[block.id]) return [];
    return [block.title?.trim() || richTextPrompt(block.content).trim() || (block.type === "long_answer" ? "Long Answer" : `Required ${block.type.replaceAll("_", " ")}`)];
  });
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

function HomeworkBlockContent({ block, answers, errors, locked, updateAnswer }: {
  block: ParticipantHomeworkBlock;
  answers: ParticipantHomeworkAnswers;
  errors: Record<string, string>;
  locked: boolean;
  updateAnswer: (blockId: string, answer: ParticipantHomeworkAnswer) => void;
}) {
  if (block.type === "side_by_side_response" && block.sideBySideConfig && block.sideBySideResponseIds) {
    const rows = sideBySideAnswerRows(
      typeof answers[block.sideBySideResponseIds.left] === "string" ? answers[block.sideBySideResponseIds.left] as string : "",
      typeof answers[block.sideBySideResponseIds.right] === "string" ? answers[block.sideBySideResponseIds.right] as string : "",
      block.sideBySideConfig.groupId,
    );
    function updateRow(rowId: string, side: SideBySideResponseSide, value: string) {
      const nextRows = rows.map((row) => row.id === rowId ? { ...row, [side]: value } : row);
      updateAnswer(block.sideBySideResponseIds!.left, sideBySideAnswerColumn(nextRows, "left"));
      updateAnswer(block.sideBySideResponseIds!.right, sideBySideAnswerColumn(nextRows, "right"));
    }
    function addRow() {
      const nextRows = [...rows, { id: crypto.randomUUID(), left: "", right: "" }];
      updateAnswer(block.sideBySideResponseIds!.left, sideBySideAnswerColumn(nextRows, "left"));
      updateAnswer(block.sideBySideResponseIds!.right, sideBySideAnswerColumn(nextRows, "right"));
    }
    return <>
      {block.description?.trim() ? <p className="mb-5 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{block.description}</p> : null}
      <p className="mb-3 text-xs text-text-muted">{block.sideBySideConfig.bothRequired ? "At least one complete pair is required. Complete both responses in any pair you start." : "Responses are optional."}</p>
      <SideBySideResponseFields config={block.sideBySideConfig} rows={rows} readOnly={locked}
        errors={{ left: errors[block.sideBySideResponseIds.left], right: errors[block.sideBySideResponseIds.right] }}
        onChange={updateRow} onAdd={addRow} />
    </>;
  }
  if (block.type === "rich_text" && block.content && typeof block.content === "object" && !Array.isArray(block.content)) {
    return <div className="grid gap-3"><h3 className="font-heading text-lg font-bold text-text-primary">{block.title}</h3><RichTextReadOnly content={block.content as Record<string, unknown>} compact contentClassName="p-0" /></div>;
  }
  if (block.type === "video_link" && block.title && block.url && block.description) return <VideoLinkPreview title={block.title} url={block.url} description={block.description} />;
  if (block.type === "long_answer" && block.content && typeof block.content === "object" && !Array.isArray(block.content)) {
    return <><RichTextReadOnly content={block.content as Record<string, unknown>} compact contentClassName="p-0" /><div className="mt-5 border-t border-border pt-4"><label htmlFor={`answer-${block.id}`} className="text-sm font-semibold text-text-primary">Your response <span className="font-normal text-text-muted">(required)</span></label><textarea id={`answer-${block.id}`} name={`answer-${block.id}`} value={typeof answers[block.id] === "string" ? String(answers[block.id]) : ""} onChange={(event) => updateAnswer(block.id, event.currentTarget.value)} readOnly={locked} rows={5} aria-invalid={Boolean(errors[block.id])} aria-describedby={errors[block.id] ? `answer-error-${block.id}` : undefined} className="mt-2 min-h-32 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary read-only:bg-surface-muted" />{errors[block.id] ? <p id={`answer-error-${block.id}`} role="alert" className="mt-2 text-sm text-danger">{errors[block.id]}</p> : null}</div></>;
  }
  if (block.type === "checkbox_question" || block.type === "radio_question") {
    return <HomeworkSelectionQuestion block={block} answer={answers[block.id]} locked={locked} error={errors[block.id]} onChange={(answer) => updateAnswer(block.id, answer)} />;
  }
  return <p className="text-sm text-text-muted">This Homework content is unavailable.</p>;
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
  const pages = homework.pages?.length ? homework.pages : [{ id: "00000000-0000-4000-8000-000000000001", title: "Page 1", position: 0 }];
  const [pageIndex, setPageIndex] = useState(0);
  const currentPage = pages[Math.min(pageIndex, pages.length - 1)]!;
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = participantAnswersAreDirty(answers, savedAnswers);
  const missingRequirements = participantMissingRequirements(homework, answers);
  const submitHasRequiredErrors = missingRequirements.length > 0;
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
    <div className="grid items-start gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
      <PageNavigation
        ariaLabel="Your Homework pages"
        pages={pages.map((page, index) => ({ id: page.id, title: page.title || `Page ${index + 1}` }))}
        selectedPageId={currentPage.id}
        emptyMessage="No pages are available."
        onSelect={(pageId) => {
          const nextPageIndex = pages.findIndex((page) => page.id === pageId);
          if (nextPageIndex >= 0) setPageIndex(nextPageIndex);
        }}
      />
      <div className="min-w-0">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-sm font-medium text-text-muted">Page {pageIndex + 1} of {pages.length}</p><h3 className="font-heading mt-1 text-xl font-bold text-text-primary">{currentPage.title || `Page ${pageIndex + 1}`}</h3></div>
          <nav aria-label="Homework page navigation" className="flex gap-2">
            <button type="button" disabled={pageIndex === 0} onClick={() => setPageIndex((index) => Math.max(0, index - 1))} className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Previous Page</button>
            <button type="button" disabled={pageIndex >= pages.length - 1} onClick={() => setPageIndex((index) => Math.min(pages.length - 1, index + 1))} className="min-h-10 rounded-md border border-border px-3 text-sm font-semibold text-text-primary disabled:cursor-not-allowed disabled:opacity-50">Next Page</button>
          </nav>
        </header>
        <form noValidate onSubmit={(event) => event.preventDefault()}>
          <div className="grid gap-4">{homework.blocks.filter((block) => (block.pageId ?? pages[0]!.id) === currentPage.id).map((block) => <Card key={block.id} className="p-5">
            <HomeworkBlockContent block={block} answers={answers} errors={fieldErrors} locked={locked} updateAnswer={updateAnswer} />
          </Card>)}</div>
          {locked ? <p className="mt-5 text-sm text-text-muted">Submitted Homework is read-only.</p> : <>
            <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => persist("save")} disabled={pending || !dirty} className="min-h-10 cursor-pointer rounded-md border border-border bg-surface px-4 text-sm font-semibold text-text-primary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Save Draft"}</button><button type="button" onClick={() => persist("submit")} disabled={pending || submitHasRequiredErrors} className="min-h-10 cursor-pointer rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Submitting…" : "Submit Homework"}</button></div>
            {missingRequirements.length ? <p className="mt-3 text-sm text-text-muted" role="status">Complete these required responses to submit: {missingRequirements.join("; ")}.</p> : null}
          </>}
          {message ? <p role={message.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${message.kind === "error" ? "text-danger" : "text-success-strong"}`}>{message.text}</p> : null}
        </form>
      </div>
    </div>
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
  if (!homework) return <Card className="p-5"><h2 className="font-heading text-xl font-bold text-text-primary">{emptyTitle}</h2><p className="mt-2 text-sm text-text-muted">{emptyDescription}</p></Card>;
  return <HomeworkAssignment key={`${homework.progressId}-${homework.status}`} homework={homework} readOnly={readOnly} showHeader={showHeader} onDirtyChange={onDirtyChange} onStatusChange={onStatusChange} />;
}

export function HomeworkParticipantPage({ homework }: { homework: ParticipantHomework | null }) {
  return <main id="homework-response" className="mx-auto max-w-3xl p-5 sm:p-8">{homework ? <HomeworkProgressRealtime assignmentRevisionId={homework.revisionId} /> : null}<ParticipantHomeworkContent homework={homework} /></main>;
}
