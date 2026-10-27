import Link from "next/link";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import type { Json } from "@/types/database.generated";

import { homeworkReviewAnswer, type SubmittedHomeworkQuestion, type SubmittedHomeworkReview } from "./submitted-homework-review";

function isRichTextContent(value: SubmittedHomeworkQuestion["content"]): value is { [key: string]: Json | undefined } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ReviewQuestion({ question }: { question: SubmittedHomeworkQuestion }) {
  const answers = homeworkReviewAnswer(question);
  return <Card className="p-5 sm:p-7">
    {question.title ? <h2 className="font-heading mb-3 text-lg font-bold text-text-primary">{question.title}</h2> : null}
    {isRichTextContent(question.content) ? <RichTextReadOnly content={question.content} compact contentClassName="p-0" /> : null}
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Submitted answer</h3>
      {answers.length === 0 ? <p className="mt-2 text-sm italic text-text-muted">No answer provided</p> : question.type === "long_answer"
        ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">{answers[0]}</p>
        : <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-text-primary">{answers.map((answer, index) => <li key={`${question.blockId}-${index}`}>{answer}</li>)}</ul>}
    </div>
  </Card>;
}

export function SubmittedHomeworkReviewPage({ review, partnerName }: { review: SubmittedHomeworkReview; partnerName: string }) {
  const submittedDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Los_Angeles",
  }).format(new Date(review.submittedAt));
  const caseHref = `/workspace/cases/${review.caseId}`;

  return <main className="mx-auto max-w-3xl p-5 sm:p-8 lg:p-10">
    <Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href={caseHref}>Counseling Case</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Homework Answers</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <Link href={caseHref} className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-secondary hover:text-brand-primary focus-visible:text-brand-primary">← Back to Counseling Case</Link>
    <header className="my-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Submitted Homework</p>
      <h1 className="font-heading mt-2 text-2xl font-bold text-text-primary sm:text-3xl">{partnerName}</h1>
      <p className="mt-2 text-sm text-text-secondary">Session {review.sessionSequence}: {review.sessionTitle}</p>
      <p className="mt-1 text-sm text-text-muted">Submitted {submittedDate}</p>
    </header>
    {review.questions.length ? <section aria-label={`${partnerName}'s submitted answers`} className="grid gap-4">
      {review.questions.map((question) => <ReviewQuestion key={question.blockId} question={question} />)}
    </section> : <Card className="p-5"><p className="text-sm text-text-muted">This Homework assignment has no questions to review.</p></Card>}
  </main>;
}
