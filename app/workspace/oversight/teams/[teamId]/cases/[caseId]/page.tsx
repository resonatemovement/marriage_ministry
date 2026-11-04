import { notFound, redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { OversightCaseDetail } from "@/features/counseling-sessions/oversight-case-detail";
import { getCounselingOversightIdentity, getCounselingOversightProgress } from "@/features/counseling-sessions/oversight-queries";
import { requireActiveWorkspace } from "@/lib/auth/session";

const allowedWorkspaces = ["admin", "campus_lead", "coach"] as const;

export default async function CounselingOversightCaseRoute({ params }: { params: Promise<{ teamId: string; caseId: string }> }) {
  const { teamId, caseId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/oversight/teams/${teamId}/cases/${caseId}`);
  if (!allowedWorkspaces.includes(workspace as typeof allowedWorkspaces[number])) redirect("/workspace");
  const cases = await getCounselingOversightProgress(teamId);
  const item = cases.find((progress) => progress.caseId === caseId) ?? null;
  if (!item) notFound();
  const coupleIdentity = await getCounselingOversightIdentity(caseId);
  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}><OversightCaseDetail item={item} identity={coupleIdentity} /></WorkspaceShell>;
}
