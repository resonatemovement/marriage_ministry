import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { IntakeRequestQueue } from "@/features/intake-requests/intake-pages";
import { getIntakeRequestQueue } from "@/features/intake-requests/queries";
import { requireOneOfWorkspaces } from "@/lib/auth/session";

export default async function IntakeRequestsRoute({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; deleted?: string }> }) {
  const [identity, params] = await Promise.all([requireOneOfWorkspaces(["admin", "campus_lead"], "/intake-requests"), searchParams]);
  const result = await getIntakeRequestQueue({ search: params.q, status: params.status });
  return <WorkspaceShell workspace={identity.workspaces.includes("admin") ? "admin" : "campus_lead"} activeHref="/intake-requests" identity={identity}><IntakeRequestQueue requests={result.requests} error={result.error} search={params.q} status={params.status} deleted={params.deleted === "1"} /></WorkspaceShell>;
}
