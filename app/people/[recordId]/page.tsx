import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { PeopleDetailPage } from "@/features/people/people-detail-page";
import { getPeopleDetailActionContext } from "@/features/people/detail-action-queries";
import { getPeopleDetail } from "@/features/people/detail-queries";
import { requireWorkspace } from "@/lib/auth/session";

export default async function PeopleDetailRoute({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const identity = await requireWorkspace("admin", `/people/${recordId}`);
  const detail = await getPeopleDetail(recordId);
  if (!detail) notFound();
  const context = await getPeopleDetailActionContext(detail);

  return <WorkspaceShell workspace="admin" activeHref="/people" identity={identity}><PeopleDetailPage detail={detail} context={context} /></WorkspaceShell>;
}
