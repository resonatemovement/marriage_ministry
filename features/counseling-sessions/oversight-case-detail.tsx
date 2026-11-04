import { GroupedAvatars } from "@/components/shared/grouped-avatars";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { counselingProgressPercent } from "./presentation";
import type { CounselingOversightProgress } from "./oversight-queries";
import type { CounselingOversightIdentity } from "./oversight-queries";

export function OversightCaseDetail({ item, identity }: { item: CounselingOversightProgress; identity: CounselingOversightIdentity | null }) {
  const nextMeeting = item.nextMeetingAt
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short", timeZone: "America/Los_Angeles" }).format(new Date(item.nextMeetingAt))
    : "Not scheduled";
  const progress = counselingProgressPercent(item.sessionProgress, item.caseStatus === "finished");
  const coupleName = identity?.coupleName ?? item.coupleName;
  const actualPhotoPartners = (identity?.partners ?? []).filter((partner) => partner.photoUrl).map(({ id, name, photoUrl }) => ({ id, name, photoUrl }));
  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{coupleName}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
    <header className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5 sm:flex-row sm:items-center sm:p-7">
      {actualPhotoPartners.length ? <GroupedAvatars people={actualPhotoPartners} label={`${coupleName} partner photos`} /> : null}
      <div className="min-w-0"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Read-only counseling progress</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{coupleName}</h1>{identity?.partners.length ? <p className="mt-1 text-sm text-text-muted">{identity.partners.map((partner) => partner.name).join(" & ")}</p> : null}</div>
    </header>
    <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-bold text-text-primary">Counseling Progress</h2><p className="mt-1 text-sm text-text-muted">Current Session and program progress</p></div><Badge>{item.caseStatus}</Badge></div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-text-muted">Session progress</p><p className="font-heading mt-1 text-2xl font-bold text-text-primary">{item.sessionProgress}</p>
        {progress !== null ? <div role="progressbar" aria-label="Counseling program progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full bg-brand-primary" style={{ width: `${progress}%` }} /></div> : null}
        <div className="mt-5 border-t border-border pt-4"><p className="text-sm text-text-muted">{progress === null ? "Session progress is not available." : `${Math.round(progress)}% of published Sessions completed.`}</p></div>
      </Card>
      <aside className="space-y-4"><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Next meeting</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{nextMeeting}</p></Card><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Homework completion</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{item.homeworkStatus}</p></Card><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counselor of record</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{item.teamName}</p></Card></aside>
    </section>
    <p className="mt-4 text-xs text-text-muted">This oversight view contains progress summaries only. Counseling notes, Homework answers, and participant responses are not available here.</p>
  </main>;
}
