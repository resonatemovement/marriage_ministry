import { Card } from "@/components/ui/card";

import type { CounselingContactDetail } from "@/features/counseling-contacts/queries";
import { PeopleBreadcrumbs, type PeopleBreadcrumb } from "./breadcrumbs";
import { PeopleDetailMemberCard } from "./people-detail-page";
import { PartnerDetailsEditor } from "./partner-details-editor";

export function ReadOnlyContactDetailPage({ detail, breadcrumbs, canEditDetails = false }: { detail: CounselingContactDetail; breadcrumbs: PeopleBreadcrumb[]; canEditDetails?: boolean }) {
  const caseAllowsDetailsEdit = detail.caseStatus === "active" || detail.caseStatus === "pending_final";
  return <main className="mx-auto max-w-6xl min-w-0 p-4 sm:p-6 lg:p-8"><PeopleBreadcrumbs items={breadcrumbs} /><Card className="overflow-hidden"><header className="border-b border-border/70 px-5 py-6 sm:px-7 sm:py-7"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">{detail.roleLabel}</p><h1 className="font-heading mt-1 break-words text-2xl font-bold text-text-primary sm:text-3xl">{detail.name}</h1><p className="mt-2 text-sm text-text-muted">{detail.campus ?? "Campus not assigned"}</p></header><section className="px-5 py-6 sm:px-7 sm:py-7"><h2 className="font-heading text-xl font-bold text-text-primary">{detail.kind === "couple" ? "Partners" : "Team Members"}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{detail.members.map((member) => <PeopleDetailMemberCard key={member.id} member={member} detailsEditor={canEditDetails && caseAllowsDetailsEdit && detail.kind === "couple" ? <PartnerDetailsEditor coupleGroupId={detail.id} profileId={member.id} firstName={member.firstName} lastName={member.lastName} phone={member.phone} email={member.email} gender={member.gender} /> : undefined} />)}</div></section></Card></main>;
}
