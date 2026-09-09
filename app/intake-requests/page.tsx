import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { IntakeRequestQueue } from "@/features/intake-requests/intake-pages";
import { getIntakeRequestQueue } from "@/features/intake-requests/queries";
import { requireWorkspace } from "@/lib/auth/session";

export default async function IntakeRequestsRoute({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const [identity, params] = await Promise.all([requireWorkspace("admin", "/intake-requests"), searchParams]);
  const result = await getIntakeRequestQueue({ search: params.q, status: params.status });
  return <WorkspaceShell workspace="admin" activeHref="/intake-requests" identity={identity}><IntakeRequestQueue requests={result.requests} error={result.error} search={params.q} status={params.status} /></WorkspaceShell>;
}
