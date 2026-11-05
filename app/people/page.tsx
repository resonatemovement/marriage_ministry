import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { PeoplePage } from "@/features/people/people-page";
import { getPeopleRecords } from "@/features/people/queries";
import { normalizeCoupleListStatus, normalizePeopleFilter } from "@/features/people/types";
import { requireOneOfWorkspaces } from "@/lib/auth/session";
import { getCampusList } from "@/features/settings/campus-queries";
import { InvitePeopleForm } from "@/features/people/invite-people-form";
import { peopleListHref } from "@/features/people/breadcrumbs";

export default async function PeopleRoute({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; caseStatus?: string }> }) {
  const params = await searchParams;
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], "/people");
  const coupleListStatus = normalizeCoupleListStatus(params.caseStatus);
  const filter = coupleListStatus ? "couples" : normalizePeopleFilter(params.filter);
  const search = params.q ?? "";
  const result = await getPeopleRecords(filter, search, coupleListStatus);
  const isAdmin = identity.workspaces.includes("admin");
  const campuses = isAdmin ? (await getCampusList()).filter((campus) => campus.active) : [];
  const returnTo = coupleListStatus ? peopleListHref(filter, search, coupleListStatus) : peopleListHref(params.filter ?? "", search);
  return <WorkspaceShell workspace={isAdmin ? "admin" : "campus_lead"} activeHref="/people" identity={identity}><PeoplePage records={result.records} filter={filter} search={search} caseListStatus={coupleListStatus} returnTo={returnTo} error={result.error} inviteAction={!coupleListStatus && isAdmin ? <InvitePeopleForm campuses={campuses} isSuperAdmin={identity.roles.includes("super_admin")}/> : undefined} /></WorkspaceShell>;
}
