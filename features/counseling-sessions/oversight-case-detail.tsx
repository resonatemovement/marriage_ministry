import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CounselingOversightProgress } from "./oversight-queries";

export function OversightCaseDetail({ item }: { item: CounselingOversightProgress | null }) {
  if (!item) notFound();
  const nextMeeting = item.nextMeetingAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(item.nextMeetingAt))
    : "Not scheduled";
  return <main className="mx-auto max-w-3xl p-5 sm:p-8 lg:p-10">
    <Link href="/workspace" className="text-sm font-semibold text-brand-primary hover:underline">Back to Workspace</Link>
    <header className="mt-5"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Read-only counseling progress</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{item.coupleName}</h1></header>
    <Card className="mt-6 p-5 sm:p-6"><dl className="space-y-4">
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counselor of record</dt><dd className="mt-1 font-medium text-text-primary">{item.teamName}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Case status</dt><dd className="mt-1"><Badge>{item.caseStatus}</Badge></dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Session progress</dt><dd className="mt-1 font-medium text-text-primary">{item.sessionProgress}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Next meeting</dt><dd className="mt-1 font-medium text-text-primary">{nextMeeting}</dd></div>
      <div><dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">Homework completion</dt><dd className="mt-1 font-medium text-text-primary">{item.homeworkStatus}</dd></div>
    </dl></Card>
    <p className="mt-4 text-xs text-text-muted">This oversight view contains progress summaries only. Counseling notes and participant responses are not available here.</p>
  </main>;
}
