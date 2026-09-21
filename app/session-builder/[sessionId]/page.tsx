import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { requireSessionBuilderAccess } from "@/features/session-builder/access";
import { SessionEditor } from "@/features/session-builder/session-editor";
import { SessionMaterialEditor } from "@/features/session-builder/session-material-editor";
import { getSession, getSessionMaterialBlocks } from "@/features/session-builder/queries";

export default async function SessionDetailPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [{ sessionId }, access] = await Promise.all([params, requireSessionBuilderAccess("/session-builder")]);
  const [session, blocks] = await Promise.all([getSession(sessionId), getSessionMaterialBlocks(sessionId)]);
  if (!session) notFound();
  return <WorkspaceShell workspace={access.workspace} activeHref="/session-builder" identity={access.identity}><main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10"><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Session {session.sequenceNumber}</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Edit Session</h1><p className="mt-2 text-sm text-text-muted">Manage this session draft and its lifecycle.</p><section className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6"><SessionEditor session={session}><SessionMaterialEditor sessionId={session.id} blocks={blocks} archived={session.status === "archived"} /></SessionEditor></section></main></WorkspaceShell>;
}
