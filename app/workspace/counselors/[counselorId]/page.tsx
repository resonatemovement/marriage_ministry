import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { Card } from "@/components/ui/card";
import { getCurrentCoachCounselorDetail } from "@/features/counseling-sessions/workspace-queries";
import { PeopleBreadcrumbs } from "@/features/people/breadcrumbs";
import { requireActiveWorkspace } from "@/lib/auth/session";

export default async function CoachCounselorDetailRoute({ params }: { params: Promise<{ counselorId: string }> }) {
  const { counselorId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/counselors/${counselorId}`);
  if (workspace !== "coach") redirect("/workspace");

  const detail = await getCurrentCoachCounselorDetail(counselorId);
  if (!detail) notFound();

  return <WorkspaceShell workspace="coach" activeHref="/workspace" identity={identity}>
    <main className="mx-auto max-w-6xl min-w-0 p-4 sm:p-6 lg:p-8">
      <PeopleBreadcrumbs items={[{ label: "Workspace", href: "/workspace" }, { label: "Counselors" }, { label: detail.name, current: true }]} />
      <Card className="p-5 sm:p-7">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Counselor Team</p>
        <h1 className="font-heading mt-1 break-words text-2xl font-bold text-text-primary sm:text-3xl">{detail.name}</h1>
        <p className="mt-2 text-sm text-text-muted">Counselor · {detail.campus ?? "Campus not assigned"}</p>
        <section aria-labelledby="counselor-members-heading" className="mt-6 border-t border-border/70 pt-5">
          <h2 id="counselor-members-heading" className="font-heading text-base font-semibold text-text-primary">Team members</h2>
          {detail.members.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{detail.members.map((member) => <li key={member.id} className="rounded-lg border border-border bg-surface-muted/40 px-4 py-3 text-sm font-medium text-text-primary">{member.name}</li>)}</ul> : <p className="mt-3 text-sm text-text-muted">No active team members.</p>}
        </section>
      </Card>
    </main>
  </WorkspaceShell>;
}
