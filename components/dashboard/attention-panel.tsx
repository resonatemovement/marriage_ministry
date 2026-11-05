"use client";

import { useState, type TouchEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DashboardAttentionItem } from "@/features/dashboard/data";

import { SectionHeading } from "./section-heading";

function AttentionLink({ item }: { item: DashboardAttentionItem }) {
  return <Link href={item.href} className="block rounded-lg border border-border bg-white p-4 transition hover:border-brand-primary/40 hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none">
    <Badge className="bg-warning-soft text-warning-strong">{item.category}</Badge>
    <p className="mt-2 font-heading text-sm font-bold text-text-primary">{item.title}</p>
    <p className="mt-1 text-sm text-text-muted">{item.detail}</p>
  </Link>;
}

export function AttentionPanel({ items, error = false }: { items: readonly DashboardAttentionItem[] | null; error?: boolean }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const count = items?.length ?? 0;
  const activeIndex = count ? Math.min(index, count - 1) : 0;
  const multiple = count > 1;
  const move = (direction: -1 | 1) => setIndex((current) => ((Math.min(current, count - 1) + direction + count) % count));
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!multiple || touchStart === null) return;
    const delta = event.changedTouches[0]?.clientX - touchStart;
    if (delta < -48) move(1);
    if (delta > 48) move(-1);
    setTouchStart(null);
  };

  return <Card id="attention" className="p-6 sm:p-7">
    <SectionHeading title="Needs Attention" description="Actionable Intake Requests and unassigned Couples" action={<Link href="/dashboard/attention" className="text-sm font-semibold text-brand-primary hover:underline">View All</Link>} />
    {error ? <p role="status" className="mt-6 text-sm text-text-muted">Needs Attention is temporarily unavailable.</p> : count === 0 ? <p className="mt-6 text-sm text-text-muted">Nothing needs attention right now.</p> : <div className="mt-6" onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)} onTouchEnd={onTouchEnd}>
      <AttentionLink item={items![activeIndex]!} />
      {multiple ? <div className="mt-4 flex items-center justify-between">
        <button type="button" aria-label="Previous attention item" onClick={() => move(-1)} className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none"><ArrowLeft className="size-4" aria-hidden="true" /></button>
        <p aria-live="polite" className="text-xs text-text-muted">{activeIndex + 1} of {count}</p>
        <button type="button" aria-label="Next attention item" onClick={() => move(1)} className="grid size-10 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none"><ArrowRight className="size-4" aria-hidden="true" /></button>
      </div> : null}
    </div>}
  </Card>;
}
