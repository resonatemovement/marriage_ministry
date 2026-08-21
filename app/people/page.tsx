import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { PeoplePage } from "@/features/people/people-page";
import { getPeopleRecords } from "@/features/people/queries";
import { peopleFilters, type PeopleFilter } from "@/features/people/types";
import { requireWorkspace } from "@/lib/auth/session";

function filterFrom(value: string | undefined): PeopleFilter { return peopleFilters.includes(value as PeopleFilter) ? value as PeopleFilter : "all"; }

export default async function PeopleRoute({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const params = await searchParams;
  const identity = await requireWorkspace("admin", "/people");
  const filter = filterFrom(params.filter);
  const search = params.q ?? "";
  const result = await getPeopleRecords(filter, search);
  return <WorkspaceShell workspace="admin" activeHref="/people" identity={identity}><PeoplePage records={result.records} filter={filter} search={search} error={result.error}/></WorkspaceShell>;
}
