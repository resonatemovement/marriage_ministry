import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { PeopleDetailPage } from "@/features/people/people-detail-page";
import { getPeopleDetailActionContext } from "@/features/people/detail-action-queries";
import { getPeopleDetail } from "@/features/people/detail-queries";
import { requireOneOfWorkspaces } from "@/lib/auth/session";
import { buildPeopleBreadcrumbs, parsePeopleTrail, validatePeopleReturnTo } from "@/features/people/breadcrumbs";
import { getOperationalHierarchy } from "@/features/people/operational-hierarchy-queries";

export default async function PeopleDetailRoute({ params, searchParams }: { params: Promise<{ recordId: string }>; searchParams: Promise<{ trail?: string; returnTo?: string }> }) {
  const { recordId } = await params;
  const { trail: rawTrail, returnTo } = await searchParams;
  const identity = await requireOneOfWorkspaces(["admin", "campus_lead"], `/people/${recordId}`);
  const detail = await getPeopleDetail(recordId);
  if (!detail) notFound();
  const trail = parsePeopleTrail(rawTrail, recordId);
  const parents = (await Promise.all(trail.map((id) => getPeopleDetail(id)))).filter((parent): parent is NonNullable<typeof parent> => Boolean(parent));
  const isAdmin = identity.workspaces.includes("admin");
  const [context, hierarchy] = await Promise.all([isAdmin ? getPeopleDetailActionContext(detail) : identity.workspaces.includes("campus_lead") ? getPeopleDetailActionContext(detail, "campus_lead") : null, isAdmin && detail.kind === "group" && ["campus_leads", "coaches", "counselors"].includes(detail.type) ? getOperationalHierarchy() : null]);

  return <WorkspaceShell workspace={isAdmin ? "admin" : "campus_lead"} activeHref="/people" identity={identity}><PeopleDetailPage detail={detail} context={context} hierarchy={hierarchy} breadcrumbs={buildPeopleBreadcrumbs(detail, parents, trail, validatePeopleReturnTo(returnTo))} trail={[...trail, recordId]} isSuperAdmin={identity.roles.includes("super_admin")} /></WorkspaceShell>;
}
