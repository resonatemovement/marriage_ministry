import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { getCurrentCampusLeadCoaches } from "@/features/counseling-sessions/workspace-queries";
import { PeopleDetailPage } from "@/features/people/people-detail-page";
import { getPeopleDetail } from "@/features/people/detail-queries";
import { requireActiveWorkspace } from "@/lib/auth/session";

export default async function CounselingCoachDetailRoute({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/coaches/${coachId}`);
  if (workspace !== "campus_lead") redirect("/workspace");

  const coaches = await getCurrentCampusLeadCoaches();
  if (!coaches.some((coach) => coach.id === coachId)) notFound();
  const detail = await getPeopleDetail(coachId);
  if (!detail || detail.kind !== "group" || detail.type !== "coaches") notFound();

  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}><PeopleDetailPage detail={detail} context={null} breadcrumbs={[{ label: "Workspace", href: "/workspace" }, { label: "Coaches" }, { label: detail.name, current: true }]} trail={[]} /></WorkspaceShell>;
}
