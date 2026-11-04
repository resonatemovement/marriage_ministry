"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import type { CounselingOversightProgress } from "./oversight-queries";
import type { OversightTeamNode } from "./oversight-rail-queries";

function coupleCountLabel(count: number) {
  return `${count} ${count === 1 ? "Couple" : "Couples"}`;
}

function TeamNode({ team }: { team: OversightTeamNode }) {
  return <Collapsible className="min-w-0 rounded-md border border-border bg-white">
    <div className="flex min-w-0 items-center gap-2 px-3 py-2">
      <CollapsibleTrigger className="group grid size-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none" aria-label={`Expand ${team.role} team ${team.name}`}>
        <ChevronRight className="size-4 group-data-[state=open]:hidden" aria-hidden="true" />
        <ChevronDown className="hidden size-4 group-data-[state=open]:block" aria-hidden="true" />
      </CollapsibleTrigger>
      <div className="min-w-0 flex-1">
        <Link href={team.href} className="block break-words text-sm font-semibold text-brand-primary hover:underline focus-visible:bg-sidebar-accent">{team.name}</Link>
        <p className="break-words text-xs text-text-muted">{team.role}{team.campus ? ` · ${team.campus}` : ""}</p>
      </div>
      <span className="shrink-0 text-xs text-text-muted">{coupleCountLabel(team.cases.length)}</span>
    </div>
    <CollapsibleContent className="border-t border-border px-3 py-2">
      {team.cases.length ? <div className="space-y-2">{team.cases.map((item) => <CaseProgressRow key={item.caseId} item={item} href={`/workspace/oversight/teams/${team.id}/cases/${item.caseId}`} />)}</div> : <p className="py-1 text-xs text-text-muted">No active Couples assigned.</p>}
      {team.children.length ? <div className="mt-3 space-y-2 border-l-2 border-border pl-3">{team.children.map((child) => <TeamNode key={child.id} team={child} />)}</div> : null}
    </CollapsibleContent>
  </Collapsible>;
}

export function CaseProgressRow({ item, href }: { item: CounselingOversightProgress; href: string }) {
  return <Link href={href} className="block rounded-md bg-surface-muted/60 px-3 py-2 hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none">
    <span className="block break-words text-sm font-medium text-text-primary">{item.coupleName}</span>
    <span className="mt-0.5 block break-words text-xs text-text-muted">{item.caseStatus} · {item.sessionProgress}</span>
    <span className="block break-words text-xs text-text-muted">Next meeting: {item.nextMeetingAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(item.nextMeetingAt)) : "Not scheduled"}</span>
    <span className="block text-xs text-text-muted">Homework: {item.homeworkStatus}</span>
  </Link>;
}

export function OversightTeamList({ title, teams, empty }: { title: string; teams: readonly OversightTeamNode[]; empty: string }) {
  return <Card className="min-w-0 p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-heading text-base font-semibold text-text-primary">{title}</h2><span className="text-sm font-medium text-text-muted">{teams.length}</span></div>
    {teams.length ? <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">{teams.map((team) => <TeamNode key={team.id} team={team} />)}</div> : <p className="mt-3 text-sm text-text-muted">{empty}</p>}
  </Card>;
}

export function TeamCounselingProgress({ teamId, progress, childTeams = [] }: { teamId: string; progress: readonly CounselingOversightProgress[]; childTeams?: readonly OversightTeamNode[] }) {
  return <Card className="p-5 sm:p-6"><h2 className="font-heading text-lg font-bold text-text-primary">Counseling Progress</h2>{progress.length ? <div className="mt-3 space-y-2">{progress.map((item) => <CaseProgressRow key={item.caseId} item={item} href={`/workspace/oversight/teams/${teamId}/cases/${item.caseId}`} />)}</div> : <p className="mt-2 text-sm text-text-muted">No active Couples assigned to this team.</p>}{childTeams.length ? <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold text-text-primary">Supervised Counselor Teams</h3><div className="mt-2 space-y-2">{childTeams.map((team) => <TeamNode key={team.id} team={team} />)}</div></div> : null}</Card>;
}
