import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { GroupedAvatars } from "@/components/shared/grouped-avatars";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { counselingStatusLabel } from "@/lib/counseling/domain";
import type { PrepareEnrichDocument } from "@/features/prepare-enrich/model";
import { homeworkProgressLabel } from "@/features/homework/presentation";

import type { CounselingSessionCard } from "./queries";
import { counselingSessionPresentation, couplePhotoSlots } from "./presentation";

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function PartnerPhotos({ card }: { card: CounselingSessionCard }) {
  return <GroupedAvatars people={couplePhotoSlots(card.partners)} label={`${card.coupleName} partner photos`} />;
}

function PrepareEnrichCard({ caseId, document }: { caseId: string; document: PrepareEnrichDocument | null }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Prepare &amp; Enrich</p><p className="font-heading mt-2 text-base font-bold text-text-primary">Counselor Copy</p>{document ? <><p className="mt-1 break-all text-sm text-text-muted">{document.fileName}</p><a href={`/workspace/cases/${caseId}/prepare-enrich`} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-brand-primary px-3 text-sm font-semibold text-white hover:bg-brand-primary/90">View / Download</a></> : <p className="mt-1 text-sm text-text-muted">No document uploaded.</p>}</Card>;
}

export function CounselingCoupleDetailPage({ card, prepareEnrich = null }: { card: CounselingSessionCard; prepareEnrich?: PrepareEnrichDocument | null }) {
  const presentation = counselingSessionPresentation(card.state);
  const caseStatus = counselingStatusLabel(card.status, true, false) ?? card.status;
  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10"><Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/workspace">Workspace</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbLink href="/workspace">Sessions</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{card.coupleName}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]"><div className="space-y-6"><Card className="p-5 sm:p-7"><Link href={`/workspace/contacts/${card.caseId}/${card.coupleId}`} className="flex flex-col gap-5 rounded-md sm:flex-row sm:items-center"><PartnerPhotos card={card} /><div className="min-w-0"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Counseling case</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">{card.coupleName}</h1><p className="mt-2 text-sm text-text-muted">Counseling Sessions and care details for this couple.</p></div></Link></Card><section className="grid items-stretch gap-4 sm:grid-cols-2"><Card className="h-full p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current Session</p><div className="mt-2 flex flex-wrap items-center gap-2"><p className="font-heading text-lg font-bold text-text-primary">{presentation.statusLabel}</p><Badge className={card.state.kind === "completed" ? "bg-success-soft text-success-strong" : "bg-info-soft text-info-strong"}>{presentation.sessionTitle}</Badge></div>{presentation.homework ? <p className="mt-3 text-sm text-text-muted">Homework: <span className="font-medium text-text-primary">{presentation.homework}</span></p> : null}</Card><Card className="h-full p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current Homework</p>{card.homework ? <><p className="font-heading mt-2 text-base font-bold text-text-primary">{card.homework.title}</p><div className="mt-3 divide-y divide-border">{card.homework.partners.map((partner) => <div key={partner.profileId} className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"><p className="text-sm font-medium text-text-primary">{partner.name}</p><p className="text-sm text-text-muted">{homeworkProgressLabel(partner.status)}</p></div>)}</div></> : <p className="mt-2 text-sm text-text-muted">No homework assigned yet.</p>}</Card><Card className="h-full p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Next Meeting</p><p className="mt-2 flex items-start gap-2 text-sm font-medium text-text-primary">{card.state.meeting ? <><CalendarDays className="mt-0.5 size-4 shrink-0 text-text-muted" />{dateTime(card.state.meeting.startsAt)} · {card.state.meeting.location}</> : "—"}</p></Card><Card className="h-full p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Progress</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{presentation.progress}</p></Card></section></div><aside className="space-y-4"><Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Counseling Status</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{caseStatus}</p></Card><PrepareEnrichCard caseId={card.caseId} document={prepareEnrich} /></aside></section></main>;
}
