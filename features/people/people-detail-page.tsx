import { Check, Clock3, Mail, Phone, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { PeopleDetailActions } from "./people-detail-actions";
import type { PeopleDetailActionContext } from "./detail-actions-model";
import { operationalStatusLabel, type OperationalStatus, type PeopleDetail, type PeopleDetailMember } from "./detail-model";
import { counselingStatusLabel } from "@/lib/counseling/domain";
import { ResendInvitationButton } from "./resend-invitation-button";
import { ResendSetupButton } from "./resend-setup-button";
import { formatPhoneInput } from "@/features/onboarding/phone";
import { AssignedCouples } from "./assigned-couples";
import { RelationshipCard } from "./relationship-card";
import { UnassignOperationalRelationship } from "./unassign-operational-relationship";
import { UnassignCounselorOfRecord } from "./unassign-counselor-of-record";
import { PeopleBreadcrumbs, peopleDetailHref, type PeopleBreadcrumb } from "./breadcrumbs";
import { AdminOnboardingRecovery } from "@/features/onboarding/admin-recovery";
import { PersonLifecycle } from "./person-lifecycle";
import { TeamLifecycle } from "./team-lifecycle";

const typeLabels = {
  couples: "Couple",
  coaches: "Coach Team",
  counselors: "Counselor Team",
  admins: "Admin Profile",
  campus_leads: "Campus Lead Team",
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

function MemberCard({ member, recoveryCampuses = [], canRecover = false }: { member: PeopleDetailMember; recoveryCampuses?: { id: string; name: string; active: boolean }[]; canRecover?: boolean }) {
  if (member.pending) return <Card className="p-5 sm:p-6"><div className="flex flex-col items-center text-center"><div className="grid size-24 place-items-center rounded-full border-4 border-surface-muted bg-sidebar-accent text-sidebar-active"><UserRound className="size-11" aria-hidden="true" /></div><h3 className="font-heading mt-4 text-lg font-bold text-text-primary">{member.name}</h3>{member.email ? <p className="mt-1 flex max-w-full items-center gap-1.5 break-all text-sm text-text-muted"><Mail className="size-3.5 shrink-0" aria-hidden="true" />{member.email}</p> : null}</div><div className="mt-6 border-t border-border/70 pt-5"><p className="text-sm font-semibold text-text-muted">Account: Invitation pending</p><p className="mt-1 text-xs leading-5 text-text-muted">{member.deliveryStatus === "Delivery Failed" ? "The invitation is still pending. Email delivery could not be completed." : member.deliveryStatus === "Sent" ? "The invitation is still pending." : "No delivery attempt has completed yet."}</p></div>{canRecover && member.invitationId ? <ResendInvitationButton invitationId={member.invitationId} /> : null}</Card>;
  const accountReady = member.accountAccessState === "active_account";
  return <Card className="p-5 sm:p-6"><div className="flex flex-col items-center text-center">{member.photoUrl ? <Image src={member.photoUrl} alt={`${member.name} profile`} width={96} height={96} unoptimized className="size-24 rounded-full border-4 border-surface-muted object-cover" /> : <div className="grid size-24 place-items-center rounded-full border-4 border-surface-muted bg-sidebar-accent text-sidebar-active" aria-label={`${member.name} profile placeholder`}><UserRound className="size-11" aria-hidden="true" /></div>}<h3 className="font-heading mt-4 text-lg font-bold text-text-primary">{member.name}</h3>{member.email ? <p className="mt-1 flex max-w-full items-center gap-1.5 break-all text-sm text-text-muted"><Mail className="size-3.5 shrink-0" aria-hidden="true" />{member.email}</p> : null}<p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted"><Phone className="size-3.5 shrink-0" aria-hidden="true" />{member.phone ? formatPhoneInput(member.phone) : "Phone not provided"}</p></div><ul className="mt-6 space-y-3 border-t border-border/70 pt-5"><ChecklistItem label={`Account: ${accountReady ? "Active" : member.accountStatus}`} complete={accountReady} /><ChecklistItem label={member.onboardingComplete ? "Onboarding: Complete" : `Onboarding: ${member.onboardingStatus.replace("Onboarding ", "")}`} complete={member.onboardingComplete} /></ul>{canRecover && member.accountAccessState === "setup_incomplete" && member.invitationId ? <ResendSetupButton invitationId={member.invitationId} /> : null}{canRecover && accountReady && !member.onboardingComplete ? <AdminOnboardingRecovery profileId={member.id} firstName={member.firstName} lastName={member.lastName} phone={member.phone} campusId={member.campusId ?? null} email={member.email} missing={member.onboardingMissing ?? []} campuses={recoveryCampuses} /> : null}</Card>;
}

function SummaryPanel({ label, value }: { label: string; value: string }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{value}</p></Card>;
}


function DetailHeader({ detail, context }: { detail: PeopleDetail; context: PeopleDetailActionContext | null }) {
  const primaryStatus = detail.kind === "group" ? detail.operationalStatuses[0] : null;
  return <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-6 sm:px-7 sm:py-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-sidebar-active"><UsersRound className="size-6" aria-hidden="true" /></div><div className="min-w-0"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">{typeLabels[detail.type]}</p><h1 className="font-heading mt-1 break-words text-2xl font-bold text-text-primary sm:text-3xl">{detail.name}</h1><p className="mt-2 text-sm text-text-muted">{detail.campus ?? "Campus not assigned"} · Updated {dateLabel(detail.updatedAt)}</p></div></div>{primaryStatus ? <Badge className={`w-fit shrink-0 px-3 py-1.5 text-sm ${statusTone(primaryStatus)}`}>{primaryStatus.label}</Badge> : null}</div>{context ? <PeopleDetailActions detail={detail} context={context} onlyEdit /> : null}</div>;
}

function ReadinessStrip({ detail }: { detail: Extract<PeopleDetail, { kind: "group" }> }) {
  const ready = detail.members.length === 2 && detail.members.every((member) => member.accountStatus === "Active" && (detail.type !== "couples" || member.onboardingComplete));
  const label = ready ? detail.type === "couples" ? "Both partners are ready" : "Team members are ready" : detail.type === "couples" ? "Partner setup incomplete" : "Team member setup incomplete";
  return <div className={ready ? "flex items-start gap-3 border-t border-success-strong/15 bg-success-soft px-5 py-4 text-success-strong sm:px-6" : "flex items-start gap-3 border-t border-warning-strong/15 bg-warning-soft px-5 py-4 text-warning-strong sm:px-6"}><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/70"><Check className="size-3.5" aria-hidden="true" /></span><div><p className="text-sm font-bold">{label}</p><p className="mt-0.5 text-xs opacity-80">Account readiness is tracked separately from operational assignment.</p></div></div>;
}

function GroupDetail({ detail, context, trail, isSuperAdmin }: { detail: Extract<PeopleDetail, { kind: "group" }>; context: PeopleDetailActionContext | null; trail: string[]; isSuperAdmin: boolean }) {
  const assignmentLabel = detail.type === "couples" ? !detail.counselingStatus ? "No counseling case has been started yet." : detail.counselingStatus : `${detail.activeAssignmentCount} active couple${detail.activeAssignmentCount === 1 ? "" : "s"}`;
  const memberTitle = detail.type === "couples" ? "Partners" : detail.type === "coaches" ? "Coach Members" : detail.type === "counselors" ? "Counselor Members" : "Campus Lead Members";
  const counselorPanel = detail.type === "coaches" && context ? <RelationshipCard title="Counselors" rows={context.currentCounselorTeams.map((team) => ({ id: team.id, name: team.name, metadata: `Counselor · ${team.campus ?? "Campus not assigned"}`, href: peopleDetailHref(team.id, trail), action: context.mode === "admin" ? <UnassignOperationalRelationship relationship="coach-counselor" sourceId={detail.id} sourceName={detail.name} targetId={team.id} targetName={team.name} /> : undefined }))} empty="No counselors assigned." footer={<PeopleDetailActions detail={detail} context={context} hideEdit compact />} /> : null;
  const assignedCouplesPanel = detail.type === "coaches" && context ? <AssignedCouples detailId={detail.id} teamName={detail.name} assignedCouples={detail.assignedCouples} eligibleCouples={context.eligibleCouples} canManage={context.mode === "admin" || context.mode === "campus_lead"} canUnassign={context.mode === "admin"} teamType="coach" trail={trail} /> : null;
  const campusLeadCoachesPanel = detail.type === "campus_leads" && context ? <RelationshipCard title="Coaches" rows={context.currentCampusLeadCoaches.map((team) => ({ id: team.id, name: team.name, metadata: `Coach · ${team.campus ?? "Campus not assigned"}`, href: peopleDetailHref(team.id, trail), action: context.mode === "admin" ? <UnassignOperationalRelationship relationship="campus-lead-coach" sourceId={detail.id} sourceName={detail.name} targetId={team.id} targetName={team.name} /> : undefined }))} empty="No coaches assigned." footer={<PeopleDetailActions detail={detail} context={context} hideEdit compact />} /> : null;
  const counselorCoachPanel = detail.type === "counselors" && context ? <RelationshipCard title="Coach" rows={context.currentCoachTeam ? [{ id: context.currentCoachTeam.id, name: context.currentCoachTeam.name, metadata: `Coach · ${context.currentCoachTeam.campus ?? "Campus not assigned"}`, href: peopleDetailHref(context.currentCoachTeam.id, trail) }] : []} empty="No Coach assigned." footer={<PeopleDetailActions detail={detail} context={context} hideEdit compact />} /> : null;
  const directCouplesPanel = detail.type === "campus_leads" && context ? <AssignedCouples detailId={detail.id} teamName={detail.name} assignedCouples={detail.assignedCouples} eligibleCouples={context.eligibleCouples} canManage={context.mode === "admin" || context.mode === "campus_lead"} canUnassign={context.mode === "admin"} teamType="campus_lead" trail={trail} /> : null;
  const counselorCouplesPanel = detail.type === "counselors" && context ? <AssignedCouples detailId={detail.id} teamName={detail.name} assignedCouples={detail.assignedCouples} eligibleCouples={context.eligibleCouples} canManage={context.mode === "admin" || context.mode === "campus_lead"} canUnassign={context.mode === "admin"} teamType="counselor" trail={trail} /> : null;
  const coupleCounselorPanel = detail.type === "couples" && context ? <RelationshipCard title="Counselor" rows={context.currentCounselorTeam ? [{ id: context.currentCounselorTeam.id, name: context.currentCounselorTeam.name, metadata: `${context.currentCounselorTeam.type === "campus_lead" ? "Campus Lead" : context.currentCounselorTeam.type === "coach" ? "Coach" : "Counselor"}${context.currentCounselorTeam.campus ? ` · ${context.currentCounselorTeam.campus}` : ""}`, href: peopleDetailHref(context.currentCounselorTeam.id, trail), action: context.mode === "admin" ? <UnassignCounselorOfRecord coupleId={detail.id} coupleName={detail.name} teamName={context.currentCounselorTeam.name} /> : undefined }] : []} empty="Not assigned" footer={<PeopleDetailActions detail={detail} context={context} hideEdit compact />} /> : null;
  const intakeOrigin = detail.type === "couples" && detail.intakeOrigin ? <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Created from Intake Request</p><p className="font-heading mt-2 text-base font-bold text-text-primary">{detail.intakeOrigin.name ?? "Submitted Couple"}</p><p className="mt-1 text-sm text-text-muted">{detail.intakeOrigin.status} · Submitted {detail.intakeOrigin.submittedAt ? dateLabel(detail.intakeOrigin.submittedAt) : "—"}</p><Link href={`/intake-requests/${detail.intakeOrigin.id}`} className="mt-4 inline-flex text-sm font-semibold text-brand-primary hover:underline">View Intake Request</Link></Card> : null;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"><Card className="overflow-hidden"><DetailHeader detail={detail} context={context} /><section className="px-5 py-6 sm:px-7 sm:py-7"><div className="flex items-center gap-2"><UsersRound className="size-5 text-brand-primary" aria-hidden="true" /><h2 className="font-heading text-xl font-bold text-text-primary">{memberTitle}</h2></div><div className="mt-4 grid gap-4 md:grid-cols-2">{detail.members.map((member) => <MemberCard key={member.id} member={member} canRecover={context?.mode === "admin"} recoveryCampuses={context?.campuses ?? []} />)}</div><TeamLifecycle groupId={detail.id} label={typeLabels[detail.type]} isSuperAdmin={isSuperAdmin} intakeRequestId={detail.intakeOrigin?.id} /></section><ReadinessStrip detail={detail} /></Card><aside className="space-y-4">{intakeOrigin}<SummaryPanel label={detail.type === "couples" ? "Counseling Status" : "Operational Status"} value={detail.type === "couples" ? counselingStatusLabel(detail.counselingStatus, Boolean(detail.counselorAssignment), detail.operationalStatuses[0]?.label === "Awaiting Counselor Assignment") ?? "—" : operationalStatusLabel(detail.operationalStatuses)} />{campusLeadCoachesPanel}{directCouplesPanel}{counselorPanel}{counselorCoachPanel}{counselorCouplesPanel}{assignedCouplesPanel}{coupleCounselorPanel}{detail.type === "couples" ? <Card className="flex items-start gap-3 p-5"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden="true" /><p className="text-sm leading-6 text-text-muted">{assignmentLabel}</p></Card> : null}</aside></div>;
}

function ProfileDetail({ detail, context, isSuperAdmin }: { detail: Extract<PeopleDetail, { kind: "profile" }>; context: PeopleDetailActionContext | null; isSuperAdmin: boolean }) {
  return <Card className="overflow-hidden"><DetailHeader detail={detail} context={context} /><div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_280px]"><div><MemberCard member={detail.member} canRecover={context?.mode === "admin"} recoveryCampuses={context?.campuses ?? []} />{context?.mode === "admin" ? <PersonLifecycle profileId={detail.id} active={detail.member.accountAccessState !== "deactivated"} isSuperAdmin={isSuperAdmin} /> : null}</div><aside className="space-y-4"><SummaryPanel label="Profile Type" value={typeLabels[detail.type]} /><SummaryPanel label="Campus" value={detail.campus ?? "Campus not assigned"} /><SummaryPanel label="Last Updated" value={dateLabel(detail.updatedAt)} /></aside></div></Card>;
}

export function PeopleDetailPage({ detail, context, breadcrumbs, trail, isSuperAdmin = false }: { detail: PeopleDetail; context: PeopleDetailActionContext | null; breadcrumbs: PeopleBreadcrumb[]; trail: string[]; isSuperAdmin?: boolean }) {
  return <main className="mx-auto max-w-6xl min-w-0 p-4 sm:p-6 lg:p-8"><PeopleBreadcrumbs items={breadcrumbs} />{detail.kind === "group" ? <GroupDetail detail={detail} context={context} trail={trail} isSuperAdmin={isSuperAdmin} /> : <ProfileDetail detail={detail} context={context} isSuperAdmin={isSuperAdmin} />}</main>;
}
