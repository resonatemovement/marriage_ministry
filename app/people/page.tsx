import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { PeoplePage } from "@/features/people/people-page";
import { getPeopleRecords } from "@/features/people/queries";
import { normalizePeopleFilter } from "@/features/people/types";
import { requireWorkspace } from "@/lib/auth/session";
import { getCampusList } from "@/features/settings/campus-queries";
import { InvitePeopleForm } from "@/features/people/invite-people-form";

export default async function PeopleRoute({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const params = await searchParams;
  const identity = await requireWorkspace("admin", "/people");
  const filter = normalizePeopleFilter(params.filter);
  const search = params.q ?? "";
  const result = await getPeopleRecords(filter, search);
  const campuses = (await getCampusList()).filter((campus) => campus.active);
  return <WorkspaceShell workspace="admin" activeHref="/people" identity={identity}><PeoplePage records={result.records} filter={filter} search={search} error={result.error} inviteAction={<InvitePeopleForm campuses={campuses} isSuperAdmin={identity.roles.includes("super_admin")}/>} /></WorkspaceShell>;
}
