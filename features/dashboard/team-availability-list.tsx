import { Search } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { filterDashboardAvailabilityTeams, teamAvailabilityDetailHref, teamAvailabilityListHref, teamCoupleCountLabel, type DashboardAvailabilityTeam, type TeamAvailabilityView } from "./team-availability";

const views: readonly { id: TeamAvailabilityView; label: string }[] = [
  { id: "available", label: "Accepting · 0 Couples" },
  { id: "all", label: "All Teams" },
];

function TeamRow({ team, view, search }: { team: DashboardAvailabilityTeam; view: TeamAvailabilityView; search: string }) {
  return <Link href={teamAvailabilityDetailHref(team.id, view, search)} aria-label={`Open ${team.name} team details`} className="group block rounded-lg focus-visible:outline-none focus-visible:bg-sidebar-accent">
    <Card className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4 transition-colors group-hover:border-brand-primary/40 group-hover:bg-surface-muted group-focus-visible:bg-sidebar-accent sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <p className="truncate font-heading font-bold text-text-primary">{team.name}</p>
        <p className="mt-1 text-sm text-text-muted">{team.role} <span aria-hidden="true">·</span> {team.campus ?? "Campus not assigned"}</p>
        <Badge className={team.acceptingNewCouples ? "mt-2 bg-success-soft text-success-strong" : "mt-2 bg-surface-muted text-text-muted"}>{team.acceptingNewCouples ? "Accepting New Couples" : "Not Accepting"}</Badge>
      </div>
      <div className="min-w-24 text-right sm:min-w-36">
        <span className="sr-only">Dedicated Couples</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted sm:hidden">Couples</p>
        <p className="mt-1 font-heading text-lg font-bold tabular-nums text-text-primary sm:mt-0">{teamCoupleCountLabel(team.coupleCount)}</p>
      </div>
    </Card>
  </Link>;
}

export function TeamAvailabilityList({ teams, view, search, error = false }: { teams: readonly DashboardAvailabilityTeam[] | null; view: TeamAvailabilityView; search: string; error?: boolean }) {
  const filtered = teams ? filterDashboardAvailabilityTeams(teams, view, search) : [];
  return <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-text-muted"><ol className="flex items-center gap-2"><li><Link href="/dashboard" className="text-brand-primary hover:underline">Dashboard</Link></li><li aria-hidden="true">/</li><li aria-current="page" className="font-medium text-text-primary">Team Availability</li></ol></nav>
    <header><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Dashboard</p><h1 className="font-heading mt-1 text-2xl font-bold text-text-primary">Team Availability</h1><p className="mt-2 text-sm text-text-muted">Active Campus Lead, Coach, and Counselor teams, ordered by directly assigned Couples.</p></header>

    <Card className="mt-7 p-5 sm:p-6">
      <nav aria-label="Team availability filters" className="flex flex-wrap gap-2">{views.map((item) => <Link key={item.id} aria-current={view === item.id ? "page" : undefined} href={teamAvailabilityListHref(item.id, search)} className={view === item.id ? "rounded-md bg-sidebar-accent px-3 py-2 text-sm font-bold text-sidebar-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30" : "rounded-md bg-surface-muted px-3 py-2 text-sm text-text-muted hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"}>{item.label}</Link>)}</nav>
      <form action="/dashboard/team-availability" method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
        {view === "all" ? <input type="hidden" name="view" value="all" /> : null}
        <label className="relative flex-1"><span className="sr-only">Search teams</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" aria-hidden="true" /><Input name="q" defaultValue={search} placeholder="Search team or campus" className="pl-10" /></label>
        <button className="min-h-10 rounded-md bg-brand-primary px-4 text-sm font-bold text-white transition hover:bg-info-strong focus-visible:bg-info-strong focus-visible:outline-none">Search</button>
      </form>
    </Card>

    <div className="mt-6 hidden grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 text-xs font-semibold uppercase tracking-wide text-text-muted sm:grid sm:gap-6"><p>Team</p><p className="min-w-36 text-right">Dedicated Couples</p></div>
    {error ? <Card className="mt-3 p-8 text-center" role="status"><h2 className="font-heading font-bold text-text-primary">Team Availability is temporarily unavailable</h2><p className="mt-2 text-sm text-text-muted">Please try again shortly.</p></Card> : filtered.length ? <div className="mt-3 space-y-3">{filtered.map((team) => <TeamRow key={team.id} team={team} view={view} search={search} />)}</div> : <Card className="mt-3 p-8 text-center"><h2 className="font-heading font-bold text-text-primary">{teams?.length ? "No teams match these filters" : "No teams are available"}</h2><p className="mt-2 text-sm text-text-muted">{view === "available" ? "Teams accepting new Couples with no direct assignments will appear here." : "Active counseling teams in your authorized scope will appear here."}</p></Card>}
  </main>;
}
