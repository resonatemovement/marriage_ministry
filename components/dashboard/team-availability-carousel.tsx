"use client";

import { useState, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { teamAvailabilityDetailHref, teamCoupleCountLabel, type DashboardAvailabilityTeam, wrapTeamAvailabilityIndex } from "@/features/dashboard/team-availability";
import { SectionHeading } from "./section-heading";

export function TeamAvailabilityCarousel({ teams, error = false }: { teams: readonly DashboardAvailabilityTeam[] | null; error?: boolean }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const count = teams?.length ?? 0;
  const activeIndex = count ? Math.min(index, count - 1) : 0;
  const multiple = count > 1;
  const move = (direction: -1 | 1) => setIndex((current) => wrapTeamAvailabilityIndex(current, direction, count));
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!multiple || touchStart === null) return;
    const delta = event.changedTouches[0]?.clientX - touchStart;
    if (delta < -48) move(1);
    if (delta > 48) move(-1);
    setTouchStart(null);
  };

  return <Card id="team-availability" className="p-6 sm:p-7">
    <SectionHeading title="Team Availability" description="Active teams accepting new Couples" action={<Link href="/dashboard/team-availability" className="text-sm font-semibold text-brand-primary hover:underline">View All Teams</Link>} />
    {error ? <p role="status" className="mt-6 text-sm text-text-muted">Team Availability is temporarily unavailable.</p> : count === 0 ? <p className="mt-6 text-sm text-text-muted">No active teams are currently accepting new Couples.</p> : <div className="mt-6" onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)} onTouchEnd={onTouchEnd}>
      <Link href={teamAvailabilityDetailHref(teams![activeIndex]!.id)} aria-label={`View ${teams![activeIndex]!.name} team details`} className="group block rounded-lg focus-visible:outline-none focus-visible:bg-sidebar-accent">
        <div className="rounded-lg border border-border bg-white p-4 transition-colors group-hover:border-brand-primary/40 group-hover:bg-surface-muted group-focus-visible:bg-sidebar-accent">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="font-heading font-bold text-text-primary">{teams![activeIndex]!.name}</p><p className="mt-1 text-sm text-text-muted">{teams![activeIndex]!.role} · {teams![activeIndex]!.campus ?? "Campus not assigned"}</p></div><Badge className="bg-success-soft text-success-strong">Accepting New Couples</Badge></div>
          <p className="mt-4 text-sm text-text-muted"><span className="font-semibold text-text-primary">{teamCoupleCountLabel(teams![activeIndex]!.coupleCount)}</span> currently assigned</p>
        </div>
      </Link>
      {multiple ? <div className="mt-3 flex items-center justify-between">
        <button type="button" aria-label="Previous available team" onClick={() => move(-1)} className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" /></button>
        <p aria-live="polite" className="text-xs text-text-muted">{activeIndex + 1} of {count}</p>
        <button type="button" aria-label="Next available team" onClick={() => move(1)} className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none"><ArrowRight className="size-4" aria-hidden="true" /></button>
      </div> : null}
    </div>}
  </Card>;
}
