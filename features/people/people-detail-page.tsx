import { ArrowLeft, Check, Clock3, Mail, Phone, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { PeopleDetailActions } from "./people-detail-actions";
import type { PeopleDetailActionContext } from "./detail-actions-model";
import type { OperationalStatus, PeopleDetail, PeopleDetailMember } from "./detail-model";
import { ResendInvitationButton } from "./resend-invitation-button";
import { formatPhoneInput } from "@/features/onboarding/phone";

const typeLabels = {
  couples: "Couple",
  coaches: "Coach Team",
  counselors: "Counselor Team",
  admins: "Admin Profile",
  authors: "Author Profile",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusTone(status: OperationalStatus) {
  return status.tone === "attention" ? "bg-warning-soft text-warning-strong" : status.tone === "positive" ? "bg-success-soft text-success-strong" : "bg-surface-muted text-text-muted";
}

function ChecklistItem({ label, complete }: { label: string; complete: boolean }) {
  const Icon = complete ? Check : Clock3;
  return <li className="flex items-center gap-2 text-sm text-text-muted"><span className={complete ? "grid size-5 place-items-center rounded-full bg-success-soft text-success-strong" : "grid size-5 place-items-center rounded-full bg-warning-soft text-warning-strong"}><Icon className="size-3.5" aria-hidden="true" /></span>{label}</li>;
}

function MemberCard({ member }: { member: PeopleDetailMember }) {
  if (member.pending) return <Card className="p-5 sm:p-6"><div className="flex flex-col items-center text-center"><div className="grid size-24 place-items-center rounded-full border-4 border-surface-muted bg-sidebar-accent text-sidebar-active"><UserRound className="size-11" aria-hidden="true" /></div><h3 className="font-heading mt-4 text-lg font-bold text-text-primary">{member.name}</h3>{member.email ? <p className="mt-1 flex max-w-full items-center gap-1.5 break-all text-sm text-text-muted"><Mail className="size-3.5 shrink-0" aria-hidden="true" />{member.email}</p> : null}</div><div className="mt-6 border-t border-border/70 pt-5"><p className="text-sm font-semibold text-text-muted">{member.deliveryStatus ?? member.accountStatus}</p><p className="mt-1 text-xs leading-5 text-text-muted">{member.deliveryStatus === "Delivery Failed" ? "The invitation is still pending. Email delivery could not be completed." : member.deliveryStatus === "Sent" ? "The invitation is still pending." : "No delivery attempt has completed yet."}</p></div>{member.invitationId ? <ResendInvitationButton invitationId={member.invitationId} /> : null}</Card>;
  const ready = member.accountStatus === "Active";
  return <Card className="p-5 sm:p-6"><div className="flex flex-col items-center text-center">{member.photoUrl ? <Image src={member.photoUrl} alt={`${member.name} profile`} width={96} height={96} unoptimized className="size-24 rounded-full border-4 border-surface-muted object-cover" /> : <div className="grid size-24 place-items-center rounded-full border-4 border-surface-muted bg-sidebar-accent text-sidebar-active" aria-label={`${member.name} profile placeholder`}><UserRound className="size-11" aria-hidden="true" /></div>}<h3 className="font-heading mt-4 text-lg font-bold text-text-primary">{member.name}</h3>{member.email ? <p className="mt-1 flex max-w-full items-center gap-1.5 break-all text-sm text-text-muted"><Mail className="size-3.5 shrink-0" aria-hidden="true" />{member.email}</p> : null}{member.phone ? <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted"><Phone className="size-3.5 shrink-0" aria-hidden="true" />{formatPhoneInput(member.phone)}</p> : null}</div><ul className="mt-6 space-y-3 border-t border-border/70 pt-5"><ChecklistItem label={ready ? "Account Active" : member.accountStatus} complete={ready} /><ChecklistItem label={ready ? "Profile Complete" : "Profile Not Started"} complete={ready} /><ChecklistItem label={ready ? "Onboarding Complete" : member.onboardingStatus} complete={ready} /></ul></Card>;
}

function SummaryPanel({ label, value }: { label: string; value: string }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{value}</p></Card>;
}

function DetailHeader({ detail, context }: { detail: PeopleDetail; context: PeopleDetailActionContext }) {
  const primaryStatus = detail.kind === "group" ? detail.operationalStatuses[0] : null;
  return <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-6 sm:px-7 sm:py-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-sidebar-active"><UsersRound className="size-6" aria-hidden="true" /></div><div className="min-w-0"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">{typeLabels[detail.type]}</p><h1 className="font-heading mt-1 break-words text-2xl font-bold text-text-primary sm:text-3xl">{detail.name}</h1><p className="mt-2 text-sm text-text-muted">{detail.campus ?? "Campus not assigned"} · Updated {dateLabel(detail.updatedAt)}</p></div></div>{primaryStatus ? <Badge className={`w-fit shrink-0 px-3 py-1.5 text-sm ${statusTone(primaryStatus)}`}>{primaryStatus.label}</Badge> : null}</div><PeopleDetailActions detail={detail} context={context} /></div>;
}

function ReadinessStrip({ detail }: { detail: Extract<PeopleDetail, { kind: "group" }> }) {
  const ready = detail.members.length === 2 && detail.members.every((member) => member.accountStatus === "Active");
  const label = ready ? detail.type === "couples" ? "Both partners are ready" : "Team members are ready" : detail.type === "couples" ? "Partner setup incomplete" : "Team member setup incomplete";
  return <div className={ready ? "flex items-start gap-3 border-t border-success-strong/15 bg-success-soft px-5 py-4 text-success-strong sm:px-6" : "flex items-start gap-3 border-t border-warning-strong/15 bg-warning-soft px-5 py-4 text-warning-strong sm:px-6"}><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/70"><Check className="size-3.5" aria-hidden="true" /></span><div><p className="text-sm font-bold">{label}</p><p className="mt-0.5 text-xs opacity-80">Account readiness is tracked separately from operational assignment.</p></div></div>;
}

function GroupDetail({ detail, context }: { detail: Extract<PeopleDetail, { kind: "group" }>; context: PeopleDetailActionContext }) {
  const assignmentLabel = detail.type === "couples" ? !detail.counselingStatus ? "No counseling case has been started yet." : detail.counselingStatus : `${detail.activeAssignmentCount} active couple${detail.activeAssignmentCount === 1 ? "" : "s"}`;
  const memberTitle = detail.type === "couples" ? "Partners" : detail.type === "coaches" ? "Coach Members" : "Counselor Members";
  const coupleAssignment = detail.type === "couples" ? detail.assignmentSummary === "No active assignments" ? "Not assigned" : detail.assignmentSummary : detail.supervisionSummary;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"><Card className="overflow-hidden"><DetailHeader detail={detail} context={context} /><section className="px-5 py-6 sm:px-7 sm:py-7"><div className="flex items-center gap-2"><UsersRound className="size-5 text-brand-primary" aria-hidden="true" /><h2 className="font-heading text-xl font-bold text-text-primary">{memberTitle}</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2">{detail.members.map((member) => <MemberCard key={member.id} member={member} />)}</div></section><ReadinessStrip detail={detail} /></Card><aside className="space-y-4"><SummaryPanel label={detail.type === "couples" ? "Counseling Status" : "Operational Status"} value={detail.operationalStatuses[0]?.label ?? "Ready"} /><SummaryPanel label="Assignments" value={detail.assignmentSummary} /><SummaryPanel label={detail.type === "couples" ? "Counselor Assignment" : "Supervision"} value={coupleAssignment} /><Card className="flex items-start gap-3 p-5"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden="true" /><p className="text-sm leading-6 text-text-muted">{assignmentLabel}</p></Card></aside></div>;
}

function ProfileDetail({ detail, context }: { detail: Extract<PeopleDetail, { kind: "profile" }>; context: PeopleDetailActionContext }) {
  return <Card className="overflow-hidden"><DetailHeader detail={detail} context={context} /><div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_280px]"><MemberCard member={detail.member} /><aside className="space-y-4"><SummaryPanel label="Profile Type" value={typeLabels[detail.type]} /><SummaryPanel label="Campus" value={detail.campus ?? "Campus not assigned"} /><SummaryPanel label="Last Updated" value={dateLabel(detail.updatedAt)} /></aside></div></Card>;
}

export function PeopleDetailPage({ detail, context }: { detail: PeopleDetail; context: PeopleDetailActionContext }) {
  return <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8"><div className="mb-5"><Link href="/people" className="inline-flex items-center gap-2 text-sm font-medium text-brand-primary hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />People &amp; Teams</Link></div>{detail.kind === "group" ? <GroupDetail detail={detail} context={context} /> : <ProfileDetail detail={detail} context={context} />}</main>;
}
