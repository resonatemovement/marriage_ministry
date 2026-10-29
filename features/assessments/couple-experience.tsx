"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RadioGroup } from "radix-ui";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { assessmentCanSubmit, assessmentResumeIndex, assessmentResultsInDisplayOrder, nextAssessmentQuestionIndex, previousAssessmentQuestionIndex, type CoupleAssessmentResult, type CoupleAssessmentStatus } from "./couple-model";
import type { CoupleAssessmentData, CoupleAssessmentSummary } from "./couple-queries";
import { saveCoupleAssessmentResponse, startCoupleAssessment, submitCoupleAssessment } from "./couple-actions";

const statusLabels: Record<CoupleAssessmentStatus, string> = { not_started: "Not Started", in_progress: "In Progress", completed: "Completed", unavailable: "Unavailable" };

function actionClass(primary = false) {
  return `inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${primary ? "bg-brand-primary text-white hover:bg-brand-primary/90" : "border border-border bg-surface text-text-primary hover:bg-surface-muted"}`;
}

export function AssessmentList({ assessments }: { assessments: CoupleAssessmentSummary[] }) {
  return <section aria-labelledby="assessments-heading" className="space-y-4">
    <h2 id="assessments-heading" className="font-heading text-2xl font-bold text-text-primary">Assessments</h2>
    {assessments.length ? <div className="grid gap-4 sm:grid-cols-2">{assessments.map((assessment) => <AssessmentSummaryCard key={assessment.assignmentId} assessment={assessment} />)}</div>
      : <Card className="p-5"><p className="font-semibold text-text-primary">No Assessments assigned</p><p className="mt-1 text-sm text-text-muted">Your Counselor will let you know when an Assessment is ready.</p></Card>}
  </section>;
}

function AssessmentSummaryCard({ assessment }: { assessment: CoupleAssessmentSummary }) {
  return <Card className="flex h-full flex-col p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-heading text-lg font-bold text-text-primary">{assessment.title}</h3><p className="mt-1 text-sm text-text-muted">{assessment.sessionTitle}</p></div><Badge className={assessment.status === "completed" ? "bg-success-soft text-success-strong" : "bg-surface-muted text-text-muted"}>{statusLabels[assessment.status]}</Badge></div>
    {assessment.status === "unavailable" ? <p className="mt-4 text-sm text-text-muted">This Assessment is not available yet. Please contact your Counselor.</p>
      : <Link className={`${actionClass(assessment.status !== "completed")} mt-5 self-start`} href={`/workspace/assessments/${assessment.assignmentId}`}>{assessment.status === "completed" ? "View Results" : assessment.status === "in_progress" ? "Continue Assessment" : "Begin Assessment"}<ArrowRight className="size-4" aria-hidden="true" /></Link>}
  </Card>;
}

export function AssessmentResults({ results }: { results: CoupleAssessmentResult[] }) {
  const ordered = assessmentResultsInDisplayOrder(results);
  if (!ordered.length) return <Card className="p-6"><h2 className="font-heading text-xl font-bold text-text-primary">Results unavailable</h2><p className="mt-2 text-sm text-text-muted">Your results could not be loaded. Please try again later.</p></Card>;
  return <Card className="p-5 sm:p-7"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Your results</p><h2 className="font-heading mt-2 text-2xl font-bold text-text-primary">Your calculated scores</h2><ol className="mt-5 space-y-3">{ordered.map((result) => <li key={result.label} className="flex items-center justify-between gap-3 rounded-md bg-surface-muted p-3"><span className="font-medium text-text-primary">{result.label}{result.isPrimary ? <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-brand-secondary">Primary</span> : null}</span><span className="tabular-nums text-sm text-text-muted">{result.score}</span></li>)}</ol><p className="mt-4 text-xs text-text-muted">Only your results are shown here.</p></Card>;
}

export function CoupleAssessmentExperience({ assessment }: { assessment: CoupleAssessmentData }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState(assessment.attemptId);
  const [answers, setAnswers] = useState(assessment.answers);
  const [savedAnswers, setSavedAnswers] = useState(assessment.answers);
  const [questionIndex, setQuestionIndex] = useState(() => assessmentResumeIndex(assessment.questions, assessment.answers));
  const [review, setReview] = useState(() => Boolean(assessment.attemptId && assessment.questions.length && assessment.questions.every((question) => assessment.answers[question.id])));
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = assessment.status === "completed";
  const questions = assessment.questions;
  const question = questions[questionIndex];

  async function begin() {
    if (starting) return;
    setStarting(true); setStartError(null);
    let result: Awaited<ReturnType<typeof startCoupleAssessment>>;
    try { result = await startCoupleAssessment(assessment.assignmentId); }
    catch { setStartError("This Assessment could not be started. Please try again."); setStarting(false); return; }
    setStarting(false);
    if (!result.success || !result.attemptId) { setStartError(result.error); return; }
    setAttemptId(result.attemptId);
    router.refresh();
  }

  async function saveChoice(questionId: string, choiceId: string) {
    if (!attemptId || saving || submitted) return;
    setAnswers((current) => ({ ...current, [questionId]: choiceId }));
    setSaving(true); setError(null);
    let result: Awaited<ReturnType<typeof saveCoupleAssessmentResponse>>;
    try { result = await saveCoupleAssessmentResponse({ attemptId, questionId, choiceId }); }
    catch { setError("Your answer could not be saved. It is still shown here; retry before continuing."); setSaving(false); return; }
    setSaving(false);
    if (!result.success) { setError("Your answer could not be saved. It is still shown here; retry before continuing."); return; }
    setSavedAnswers((current) => ({ ...current, [questionId]: choiceId }));
  }

  async function choose(questionId: string, choiceId: string) { await saveChoice(questionId, choiceId); }

  async function submit() {
    if (submitLock.current || !attemptId || !assessmentCanSubmit(questions, savedAnswers, saving, submitting)) return;
    submitLock.current = true;
    setSubmitting(true); setError(null);
    let result: Awaited<ReturnType<typeof submitCoupleAssessment>>;
    try { result = await submitCoupleAssessment(attemptId); }
    catch { setError("The Assessment could not be submitted. Please try again."); submitLock.current = false; setSubmitting(false); return; }
    submitLock.current = false;
    setSubmitting(false);
    if (!result.success) { setError(result.error); return; }
    router.refresh();
  }

  const currentAnswer = question ? answers[question.id] : undefined;
  const currentAnswerSaved = Boolean(question && currentAnswer && savedAnswers[question.id] === currentAnswer);
  const canReview = questions.length > 0 && questions.every((item) => Boolean(savedAnswers[item.id]));
  const progress = questions.length ? Math.round(((review ? questions.length : questionIndex + 1) / questions.length) * 100) : 0;
  useEffect(() => {
    if (!question || !currentAnswer || currentAnswerSaved) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [question, currentAnswer, currentAnswerSaved]);
  if (assessment.status === "unavailable") return <AssessmentPageShell assessment={assessment}><Card className="p-6"><h2 className="font-heading text-xl font-bold text-text-primary">Assessment unavailable</h2><p className="mt-2 text-sm text-text-muted">This Assessment does not have published questions yet. Please contact your Counselor.</p></Card></AssessmentPageShell>;
  if (submitted) return <AssessmentPageShell assessment={assessment}><AssessmentResults results={assessment.results} /></AssessmentPageShell>;
  if (!attemptId) return <AssessmentPageShell assessment={assessment}><Card className="p-6"><p className="text-sm text-text-muted">Assigned for {assessment.sessionTitle}</p><h2 className="font-heading mt-2 text-2xl font-bold text-text-primary">Ready when you are</h2><p className="mt-2 text-sm text-text-muted">Your progress is saved as you answer, and you can return later.</p><button type="button" onClick={begin} disabled={starting} className={`${actionClass(true)} mt-5`}>{starting ? "Starting…" : "Begin Assessment"}<ArrowRight className="size-4" aria-hidden="true" /></button>{startError ? <p role="alert" className="mt-3 text-sm text-danger">{startError}</p> : null}</Card></AssessmentPageShell>;
  return <AssessmentPageShell assessment={assessment}>
    <div className="mb-5"><div className="flex justify-between gap-3 text-sm"><span className="font-medium text-text-primary">{review ? "Review your answers" : `Question ${questionIndex + 1} of ${questions.length}`}</span><span className="text-text-muted">{progress}%</span></div><div role="progressbar" aria-label="Assessment progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-brand-primary transition-[width]" style={{ width: `${progress}%` }} /></div></div>
    {review ? <Card className="p-5 sm:p-7"><h2 className="font-heading text-xl font-bold text-text-primary">Review &amp; Submit</h2><p className="mt-2 text-sm text-text-muted">Select any question number to review or change your answer.</p><div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10">{questions.map((item, index) => <button key={item.id} type="button" onClick={() => { setQuestionIndex(index); setReview(false); setError(null); }} aria-label={`Review question ${index + 1}`} className="grid aspect-square min-h-10 place-items-center rounded-md border border-border bg-surface text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted"><Check className={`size-4 ${savedAnswers[item.id] ? "text-success-strong" : "text-danger"}`} aria-hidden="true" /><span className="sr-only">{index + 1}</span></button>)}</div><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => { setQuestionIndex(questions.length - 1); setReview(false); }} className={actionClass()}><ArrowLeft className="size-4" aria-hidden="true" />Back</button><button type="button" onClick={submit} disabled={!assessmentCanSubmit(questions, savedAnswers, saving, submitting)} className={actionClass(true)}>{submitting ? "Submitting…" : "Submit Assessment"}<ClipboardCheck className="size-4" aria-hidden="true" /></button></div></Card> : question ? <Card className="p-5 sm:p-7"><h2 className="font-heading text-xl font-bold leading-relaxed text-text-primary">{question.prompt}</h2><RadioGroup.Root value={currentAnswer ?? ""} onValueChange={(value) => choose(question.id, value)} disabled={saving || submitting} aria-label={`Answer to question ${questionIndex + 1}`} className="mt-6 grid gap-3">{question.choices.map((choice, index) => <div key={choice.id} className="flex min-h-16 items-center gap-4 rounded-md border border-border p-4 text-sm text-text-primary has-[:disabled]:opacity-60"><RadioGroup.Item id={`assessment-choice-${choice.id}`} value={choice.id} aria-label={choice.label} className="grid size-5 shrink-0 place-items-center rounded-full border border-border bg-white focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20"><RadioGroup.Indicator className="size-2.5 rounded-full bg-brand-primary" /></RadioGroup.Item><label htmlFor={`assessment-choice-${choice.id}`} className="flex min-h-8 flex-1 cursor-pointer items-center">{choice.label}</label><span className="text-xs text-text-muted">{String.fromCharCode(65 + index)}</span></div>)}</RadioGroup.Root><div aria-live="polite" className="mt-4 min-h-5 text-sm">{saving ? <span className="text-text-muted">Saving answer…</span> : currentAnswerSaved ? <span className="text-success-strong">Answer saved</span> : currentAnswer ? <span className="text-danger">Not saved yet</span> : null}</div>{currentAnswer && !currentAnswerSaved && !saving ? <button type="button" onClick={() => saveChoice(question.id, currentAnswer)} className="mt-2 min-h-10 text-sm font-semibold text-brand-secondary hover:text-brand-primary">Retry saving answer</button> : null}<div className="mt-4 flex flex-wrap justify-between gap-3"><button type="button" onClick={() => setQuestionIndex((index) => previousAssessmentQuestionIndex(index, questions.length))} disabled={saving || Boolean(currentAnswer && !currentAnswerSaved) || questionIndex === 0} className={actionClass()}><ArrowLeft className="size-4" aria-hidden="true" />Back</button>{questionIndex === questions.length - 1 ? <button type="button" onClick={() => setReview(true)} disabled={saving || !currentAnswerSaved || !canReview} className={actionClass(true)}>Review &amp; Submit<ArrowRight className="size-4" aria-hidden="true" /></button> : <button type="button" onClick={() => setQuestionIndex((index) => nextAssessmentQuestionIndex(index, questions.length))} disabled={saving || !currentAnswerSaved} className={actionClass(true)}>Next<ArrowRight className="size-4" aria-hidden="true" /></button>}</div></Card> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
  </AssessmentPageShell>;
}

function AssessmentPageShell({ assessment, children }: { assessment: CoupleAssessmentData; children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl p-5 sm:p-8"><Link href="/workspace/assessments" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-brand-secondary hover:text-brand-primary"><ArrowLeft className="size-4" aria-hidden="true" />All Assessments</Link><header className="mb-5 mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{assessment.sessionTitle}</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{assessment.title}</h1></header>{children}</main>;
}
