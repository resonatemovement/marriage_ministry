import { Suspense } from "react";
import { notFound } from "next/navigation";

import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { HomeworkBuilder } from "@/features/homework/homework-builder";
import { HomeworkBuilderLoading } from "@/features/homework/homework-builder-loading";
import { requireSessionBuilderAccess } from "@/features/session-builder/access";
import { SessionEditor } from "@/features/session-builder/session-editor";
import { getSession, getSessionMaterialBlocks, getSessions } from "@/features/session-builder/queries";
import { sessionWorkspaceFromSearch } from "@/features/session-builder/workspace";
import { hasAdministrativeAccess } from "@/lib/counseling/domain";

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
  const [blocks, sessions] = await Promise.all([getSessionMaterialBlocks(session.id), getSessions()]);

  const navigableSessions = sessions.filter((item) => item.status !== "archived" || item.id === session.id);
  if (!navigableSessions.some((item) => item.id === session.id)) {
    navigableSessions.push(session);
    navigableSessions.sort((left, right) => left.curriculumNumber - right.curriculumNumber);
  }

  return <WorkspaceShell workspace={access.workspace} activeHref="/session-builder" identity={access.identity}><main className="mx-auto max-w-[1500px] p-5 sm:p-8 lg:p-10"><Breadcrumb className="mb-5"><BreadcrumbList><BreadcrumbItem><BreadcrumbLink href="/session-builder">Session Builder</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Session {session.curriculumNumber}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb><SessionEditor session={session} sessions={navigableSessions} blocks={blocks} activeWorkspace={activeWorkspace} canManageRecommendations={hasAdministrativeAccess(access.identity.roles)} homework={activeWorkspace === "homework" ? <Suspense key={`homework-${session.id}`} fallback={<HomeworkBuilderLoading />}><HomeworkBuilder sessionId={session.id} sessionStatus={session.status as "draft" | "published"} /></Suspense> : undefined} /></main></WorkspaceShell>;
}
