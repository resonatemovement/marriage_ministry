import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireSessionBuilderAccess } from "@/features/session-builder/access";
import { SessionCreateForm } from "@/features/session-builder/session-create-form";

export default async function NewSessionPage() {
  const access = await requireSessionBuilderAccess("/session-builder/new");
  return <WorkspaceShell workspace={access.workspace} activeHref="/session-builder" identity={access.identity}><main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Session Builder</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Create a Session</h1><p className="mt-2 text-sm text-text-muted">Start with a title and save a draft when you are ready.</p><section className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6"><SessionCreateForm /></section></main></WorkspaceShell>;
}
