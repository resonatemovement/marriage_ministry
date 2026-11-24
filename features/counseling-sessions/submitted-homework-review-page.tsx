import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { RichTextReadOnly } from "@/features/session-builder/rich-text-editor";
import type { Json } from "@/types/database.generated";
import { sideBySideAnswerRows } from "@/features/homework/side-by-side-response";

import { groupSubmittedHomeworkByPage, homeworkReviewAnswer, type SubmittedHomeworkQuestion, type SubmittedHomeworkReview } from "./submitted-homework-review";

function isRichTextContent(value: SubmittedHomeworkQuestion["content"]): value is { [key: string]: Json | undefined } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ReviewQuestion({ question }: { question: SubmittedHomeworkQuestion }) {
  const answers = homeworkReviewAnswer(question);
  return <Card className="p-5 sm:p-7">
    {question.title && isRichTextContent(question.content)
      ? <div className="grid gap-3">
        <h2 className="font-heading text-lg font-bold text-text-primary">{question.title}</h2>
        <RichTextReadOnly content={question.content} compact contentClassName="p-0" />
      </div>
      : <>
        {question.title ? <h2 className="font-heading text-lg font-bold text-text-primary">{question.title}</h2> : null}
        {isRichTextContent(question.content) ? <RichTextReadOnly content={question.content} compact contentClassName="p-0" /> : null}
      </>}
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Submitted answer</h3>
      {answers.length === 0 ? <p className="mt-2 text-sm italic text-text-muted">No answer provided</p> : question.type === "long_answer"
        ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">{answers[0]}</p>
        : <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-text-primary">{answers.map((answer, index) => <li key={`${question.blockId}-${index}`}>{answer}</li>)}</ul>}
    </div>
  </Card>;
}

function ReviewSideBySide({ config, left, right }: { config: Omit<import("@/features/homework/side-by-side-response").SideBySideResponseConfig, "side">; left: SubmittedHomeworkQuestion; right: SubmittedHomeworkQuestion }) {
  const rows = sideBySideAnswerRows(left.answerText, right.answerText, config.groupId);
  return <Card className="p-5 sm:p-7">
    {config.instructions.trim() ? <p className="mb-5 whitespace-pre-wrap text-sm leading-6 text-text-secondary">{config.instructions}</p> : null}
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border" />
      <div className="mb-3 grid grid-cols-2 gap-2 border-b border-border pb-3 sm:gap-4">
        {[config.leftHeading, config.rightHeading].map((heading, index) => <h2 id={`side-by-side-${config.groupId}-${index === 0 ? "left" : "right"}-heading`} key={index} className="min-w-0 break-words px-1 font-heading text-base font-bold text-text-primary sm:px-3">{heading}</h2>)}
      </div>
      <div className="grid gap-4">
        {rows.map((row) => <div key={row.id} className="grid min-w-0 grid-cols-2 items-stretch gap-2 sm:gap-4">
          {([row.left, row.right] as const).map((answer, index) => <section key={index} aria-labelledby={`side-by-side-${config.groupId}-${index === 0 ? "left" : "right"}-heading`} className="min-w-0 px-1 sm:px-3">
          {!answer.trim() ? <p className="mt-2 text-sm italic text-text-muted">No answer provided</p>
            : <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">{answer}</p>}
          </section>)}
        </div>)}
      </div>
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

  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <Breadcrumb className="mb-3"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href={caseHref}>Counseling Case</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Homework Answers</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <header className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Submitted Homework</p>
      <h1 className="font-heading mt-2 text-2xl font-bold text-text-primary sm:text-3xl">{partnerName}</h1>
      <p className="mt-2 text-sm text-text-secondary">Session {review.sessionSequence}: {review.sessionTitle}</p>
      <p className="mt-1 text-sm text-text-muted">Submitted {submittedDate}</p>
    </header>
    {review.questions.length ? <section aria-label={`${partnerName}'s submitted answers`} className="grid gap-6">
      {groupSubmittedHomeworkByPage(review.questions, review.pages).map((page) => <section key={page.id} aria-label={page.title} className="grid gap-4">
        <h2 className="font-heading text-xl font-bold text-text-primary">{page.title}</h2>
        {page.items.map((item) => item.kind === "side_by_side"
          ? <ReviewSideBySide key={item.config.groupId} config={item.config} left={item.left} right={item.right} />
          : <ReviewQuestion key={item.question.blockId} question={item.question} />)}
      </section>)}
    </section> : <Card className="p-5"><p className="text-sm text-text-muted">This Homework assignment has no questions to review.</p></Card>}
  </main>;
}
