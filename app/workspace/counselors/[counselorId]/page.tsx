import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { getCurrentCoachCounselors } from "@/features/counseling-sessions/workspace-queries";
import { getSupervisedTeamDetail } from "@/features/people/detail-queries";
import { PeopleDetailPage } from "@/features/people/people-detail-page";
import { requireActiveWorkspace } from "@/lib/auth/session";

export default async function CoachCounselorDetailRoute({ params }: { params: Promise<{ counselorId: string }> }) {
  const { counselorId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/counselors/${counselorId}`);
  if (workspace !== "coach") redirect("/workspace");

  const counselors = await getCurrentCoachCounselors();
  if (!counselors.some((counselor) => counselor.id === counselorId)) notFound();
  const detail = await getSupervisedTeamDetail(counselorId, "counselor_team");
  if (!detail || detail.kind !== "group" || detail.type !== "counselors") notFound();

  return <WorkspaceShell workspace="coach" activeHref="/workspace" identity={identity}><PeopleDetailPage detail={detail} context={null} isSuperAdmin={false} readOnlySupervisoryView breadcrumbs={[{ label: "Workspace", href: "/workspace" }, { label: "Counselors" }, { label: detail.name, current: true }]} trail={[]} /></WorkspaceShell>;
}
