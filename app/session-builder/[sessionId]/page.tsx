import { Suspense } from "react";
import { notFound } from "next/navigation";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { HomeworkBuilder } from "@/features/homework/homework-builder";
import { HomeworkBuilderLoading } from "@/features/homework/homework-builder-loading";
import { requireSessionBuilderAccess } from "@/features/session-builder/access";
import { SessionEditor } from "@/features/session-builder/session-editor";
import { getSession, getSessionMaterialBlocks } from "@/features/session-builder/queries";
import { sessionLifecycleBadgeClass, sessionStatusLabel } from "@/features/session-builder/model";
import { sessionWorkspaceFromSearch } from "@/features/session-builder/workspace";

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const [{ sessionId }, query, access] = await Promise.all([
    params,
    searchParams,
    requireSessionBuilderAccess("/session-builder"),
  ]);
  const session = await getSession(sessionId);
  if (!session) notFound();
  const workspaceQuery = Array.isArray(query.workspace) ? query.workspace[0] : query.workspace;
  const activeWorkspace = sessionWorkspaceFromSearch(workspaceQuery);
  const blocks = await getSessionMaterialBlocks(session.id);

  return <WorkspaceShell workspace={access.workspace} activeHref="/session-builder" identity={access.identity}><main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10"><Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/session-builder">Session Builder</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Session {session.curriculumNumber}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><div className="flex flex-wrap items-center gap-3"><h1 className="font-heading text-3xl font-bold text-text-primary">Edit Session</h1><Badge className={sessionLifecycleBadgeClass(session.status)}>{sessionStatusLabel(session.status)}</Badge></div><p className="mt-2 text-sm text-text-muted">Manage this session draft and its lifecycle.</p><section className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6"><SessionEditor session={session} blocks={blocks} activeWorkspace={activeWorkspace} homework={activeWorkspace === "homework" ? <Suspense fallback={<HomeworkBuilderLoading />}><HomeworkBuilder sessionId={session.id} sessionStatus={session.status as "draft" | "published"} /></Suspense> : undefined} /></section></main></WorkspaceShell>;
}
