import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import type { AuthenticatedIdentity } from "@/lib/auth/session";
import { getWorkspaceDefinition, type WorkspaceId } from "@/lib/workspaces";

export function WorkspacePlaceholder({
  workspace,
  identity,
}: {
  workspace: Exclude<WorkspaceId, "admin">;
  identity: AuthenticatedIdentity;
}) {
  const definition = getWorkspaceDefinition(workspace);

  return (
    <WorkspaceShell workspace={workspace} activeHref={definition.href} identity={identity}>
      <main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">
          {definition.label}
        </p>
        <h1 className="font-heading mt-1 text-2xl font-bold text-text-primary">
          {definition.label}
        </h1>
        <p className="mt-2 text-sm text-text-muted">{definition.placeholderMessage}</p>
      </main>
    </WorkspaceShell>
  );
}
