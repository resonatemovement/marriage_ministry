import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { CoupleBreadcrumb } from "./couple-breadcrumb";
import type { CoupleSessionReviewData } from "./queries";

export function CoupleSessionReview({ data }: { data: CoupleSessionReviewData }) {
  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <CoupleBreadcrumb parent="Workspace" current="Sessions" />
    <header className="mb-6"><p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Your Sessions</p><h1 className="font-heading mt-2 text-3xl font-bold text-text-primary">Review Session Material</h1><p className="mt-2 text-sm text-text-muted">Revisit released Session Material and your completed Homework.</p></header>
    <Card className="divide-y divide-border overflow-hidden">
      {data.sessions.map((session) => <div key={session.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-lg font-bold text-text-primary">Session {session.number}: {session.title}</h2><Badge className="bg-success-soft text-success-strong">{session.status === "completed" ? "Completed" : "Current"}</Badge></div></div>
        <Link href={`/workspace/sessions/${session.id}`} className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 sm:self-auto">View Session<ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>)}
    </Card>
  </main>;
}
