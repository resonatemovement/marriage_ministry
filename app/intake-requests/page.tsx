import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { IntakeRequestQueue } from "@/features/intake-requests/intake-pages";
import { getIntakeRequestQueue } from "@/features/intake-requests/queries";
import { requireOneOfWorkspaces } from "@/lib/auth/session";
import { isIntakeStatusAvailableInView } from "@/features/intake-requests/model";

export default async function IntakeRequestsRoute({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; view?: string; deleted?: string }> }) {
  const [identity, params] = await Promise.all([requireOneOfWorkspaces(["admin", "campus_lead"], "/intake-requests"), searchParams]);
  const view = params.view === "added" || params.view === "all" ? params.view : "open";
  const status = params.status && isIntakeStatusAvailableInView(params.status, view) ? params.status : undefined;
  const result = await getIntakeRequestQueue({ search: params.q, status, view });
  return <WorkspaceShell workspace={identity.workspaces.includes("admin") ? "admin" : "campus_lead"} activeHref="/intake-requests" identity={identity}><IntakeRequestQueue requests={result.requests} error={result.error} search={params.q} status={status} view={view} deleted={params.deleted === "1"} /></WorkspaceShell>;
}
