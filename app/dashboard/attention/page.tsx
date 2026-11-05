import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { getDashboardAttentionItems } from "@/features/dashboard/queries";
import { requireOneOfWorkspaces } from "@/lib/auth/session";

export default async function DashboardAttentionRoute() {
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], "/dashboard/attention");
  const workspace = identity.roles.includes("admin") || identity.roles.includes("super_admin") ? "admin" : "campus_lead";
  const { items, error } = await getDashboardAttentionItems(identity);
  return <WorkspaceShell workspace={workspace} activeHref="/dashboard" identity={identity}>
    <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Dashboard</p><h1 className="font-heading mt-1 text-2xl font-bold text-text-primary">Needs Attention</h1><p className="mt-2 text-sm text-text-muted">Unresolved actionable Intake Requests and Couples.</p></div>
        <Link href="/dashboard" className="text-sm font-semibold text-brand-primary hover:underline">Back to Dashboard</Link>
      </header>
      {error ? <Card className="mt-7 p-8 text-center" role="status"><p className="font-heading font-bold text-text-primary">Needs Attention is temporarily unavailable.</p><p className="mt-2 text-sm text-text-muted">Please try again shortly.</p></Card> : items?.length ? <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} className="p-5"><Badge className="bg-warning-soft text-warning-strong">{item.category}</Badge><h2 className="font-heading mt-3 font-bold text-text-primary">{item.title}</h2><p className="mt-1 text-sm text-text-muted">{item.detail}</p><Link href={item.href} className="mt-4 inline-flex min-h-10 items-center font-semibold text-brand-primary hover:underline">{item.category === "Intake Request" ? "Review Intake Request" : item.href.startsWith("/people/") ? "View Couple" : "Open assignment workspace"}</Link></Card>)}</div> : <Card className="mt-7 p-8 text-center"><h2 className="font-heading font-bold text-text-primary">Nothing needs attention right now</h2><p className="mt-2 text-sm text-text-muted">Actionable items will appear here when follow-up is needed.</p></Card>}
    </main>
  </WorkspaceShell>;
}
