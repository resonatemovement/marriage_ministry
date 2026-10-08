import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { CounselingCoupleDetailPage } from "@/features/counseling-sessions/couple-detail-page";
import { getCounselingSessionCard } from "@/features/counseling-sessions/queries";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { getCounselorPrepareEnrichDocument } from "@/features/prepare-enrich/server";

const counselingWorkspaces = ["campus_lead", "coach", "counselor"] as const;

export default async function CounselingCaseDetailRoute({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/cases/${caseId}`);
  if (!counselingWorkspaces.includes(workspace as typeof counselingWorkspaces[number])) redirect("/workspace");
  const card = await getCounselingSessionCard(caseId);
  if (!card) notFound();
  const prepareEnrich = await getCounselorPrepareEnrichDocument(caseId);
  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}><CounselingCoupleDetailPage card={card} prepareEnrich={prepareEnrich} /></WorkspaceShell>;
}
