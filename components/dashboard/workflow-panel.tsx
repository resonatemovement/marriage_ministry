import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { DashboardProgression } from "@/features/dashboard/data";
import { MINISTRY_PROGRESSION_STAGES } from "@/lib/counseling/progression";

import { SectionHeading } from "./section-heading";

function ProgressTile({ label, count, detail, href }: { label: string; count: number | null; detail?: string; href: string | null }) {
  const content = <div className="flex h-full min-h-24 flex-col justify-between p-4 transition-colors hover:bg-surface-muted">
    <p className="font-heading text-2xl font-extrabold text-text-primary">{count ?? "—"}</p>
    <div className="mt-2"><p className="font-heading text-sm font-semibold text-text-primary">{label}</p>{detail ? <p className="mt-1 text-xs text-text-muted">{detail}</p> : null}</div>
  </div>;
  return href ? <Link href={href} aria-label={`View ${label}: ${count ?? "unavailable"}`} className="block h-full rounded-sm focus-visible:bg-sidebar-accent focus-visible:outline-none">{content}</Link> : <div className="h-full">{content}</div>;
}

export function WorkflowPanel({ progression, canNavigate = true }: { progression: DashboardProgression | null; canNavigate?: boolean }) {
  const hasData = progression !== null;
  const stages = progression?.stages ?? MINISTRY_PROGRESSION_STAGES.map((stage) => ({ ...stage, count: null, href: null }));
  const primaryStages = stages.filter((stage) => !["referred", "closed_incomplete"].includes(stage.id));
  const otherOutcomes = stages.filter((stage) => ["referred", "closed_incomplete"].includes(stage.id));
  return <div className="space-y-6">
    <Card id="workflow" className="overflow-hidden">
      <div className="p-5 sm:p-6"><SectionHeading title="Ministry Progression" description="Unique Couples and pre-Couple Intake Requests by current stage" action={!hasData ? <span className="hidden rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted sm:block">Live data unavailable</span> : null} /></div>
      <div className="grid items-stretch border-t border-border/70 sm:grid-cols-2 xl:grid-cols-5">
        {primaryStages.map((stage) => <div key={stage.id} className="h-full border-b border-border/70 sm:border-r sm:last:border-r-0"><ProgressTile label={stage.label} count={stage.count} detail={stage.valueLabel} href={canNavigate ? stage.href : stage.id === "intake" ? "/intake-requests?view=open" : null} /></div>)}
        {!hasData ? <p className="p-5 text-sm text-text-muted">Progression data is temporarily unavailable.</p> : null}
      </div>
      {otherOutcomes.length > 0 ? <section aria-labelledby="other-outcomes-heading" className="border-t border-border/70">
        <h3 id="other-outcomes-heading" className="px-5 pt-4 font-heading text-sm font-semibold text-text-primary sm:px-6">Other Outcomes</h3>
        <div className="grid items-stretch sm:grid-cols-2 xl:grid-cols-3">
          {[
            ...otherOutcomes.map((stage) => ({
              id: stage.id,
              label: stage.label,
              count: stage.count,
              detail: stage.valueLabel,
              href: canNavigate ? stage.href : null,
            })),
            {
              id: "intake-referrals",
              label: "Intake Referrals",
              count: progression?.intakeReferralCount ?? null,
              detail: "Intake Requests",
              href: "/intake-requests?view=all&status=referred_elsewhere",
            },
          ].map((tile, index) => <div key={tile.id} className={`h-full border-b border-border/70 ${index % 2 === 0 ? "sm:border-r" : "sm:border-r-0"} ${index % 3 < 2 ? "xl:border-r" : "xl:border-r-0"}`}><ProgressTile label={tile.label} count={tile.count} detail={tile.detail} href={tile.href} /></div>)}
        </div>
      </section> : null}
      {progression && progression.unclassifiedCount > 0 ? <p role="status" className="border-t border-border/70 px-5 py-3 text-sm text-text-muted">{progression.unclassifiedCount} record{progression.unclassifiedCount === 1 ? "" : "s"} need review and are not included in stage totals.</p> : null}
    </Card>

    <Card className="overflow-hidden">
      <div className="p-5 sm:p-6"><SectionHeading title="Counseling Sessions" description="Unique Couples by current Session progression" action={!hasData ? <span className="hidden rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted sm:block">Live data unavailable</span> : null} /></div>
      <div className="grid items-stretch border-t border-border/70 sm:grid-cols-2 xl:grid-cols-4">
        {(progression?.sessions ?? []).map((session) => <div key={session.id} className="h-full border-b border-border/70 sm:border-r sm:last:border-r-0"><ProgressTile label={session.number === null ? "Initial Meeting" : `Session ${session.number}`} count={session.count} href={canNavigate ? session.href : null} /></div>)}
        {progression && progression.sessions.length === 0 ? <p className="p-5 text-sm text-text-muted">No published Sessions are available.</p> : null}
      </div>
    </Card>
  </div>;
}
