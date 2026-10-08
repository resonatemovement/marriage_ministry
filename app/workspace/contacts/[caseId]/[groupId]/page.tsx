import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { getCounselingContactDetail } from "@/features/counseling-contacts/queries";
import { ReadOnlyContactDetailPage } from "@/features/people/read-only-contact-detail";
import { requireActiveWorkspace } from "@/lib/auth/session";

const counselingWorkspaces = ["campus_lead", "coach", "counselor"] as const;

export default async function CounselingContactDetailRoute({ params }: { params: Promise<{ caseId: string; groupId: string }> }) {
  const { caseId, groupId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/contacts/${caseId}/${groupId}`);
  if (workspace !== "couple" && !counselingWorkspaces.includes(workspace as typeof counselingWorkspaces[number])) redirect("/workspace");
  const detail = await getCounselingContactDetail(caseId, groupId);
  if (!detail) notFound();

  const breadcrumbs = workspace === "couple"
    ? [{ label: "Workspace", href: "/workspace" }, { label: "Counselor" }, { label: detail.name, current: true as const }]
    : [{ label: "Workspace", href: "/workspace" }, { label: "Sessions", href: "/workspace" }, { label: detail.kind === "couple" ? "Couple" : detail.roleLabel }, { label: detail.name, current: true as const }];
  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}><ReadOnlyContactDetailPage detail={detail} breadcrumbs={breadcrumbs} /></WorkspaceShell>;
}
