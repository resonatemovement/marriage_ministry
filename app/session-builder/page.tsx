import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireSessionBuilderAccess } from "@/features/session-builder/access";
import { isSessionStatus } from "@/features/session-builder/model";
import { SessionList } from "@/features/session-builder/session-list";
import { getSessions } from "@/features/session-builder/queries";

export default async function SessionBuilderPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [access, params] = await Promise.all([requireSessionBuilderAccess("/session-builder"), searchParams]);
  const status = isSessionStatus(params.status) ? params.status : undefined;
  const sessions = await getSessions(status);
  return <WorkspaceShell workspace={access.workspace} activeHref="/session-builder" identity={access.identity}><SessionList sessions={sessions} status={status} /></WorkspaceShell>;
}
