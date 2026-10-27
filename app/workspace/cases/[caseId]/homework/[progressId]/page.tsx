import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { SubmittedHomeworkReviewPage } from "@/features/counseling-sessions/submitted-homework-review-page";
import { getCounselingSessionCard, getCounselorSubmittedHomeworkReview } from "@/features/counseling-sessions/queries";
import { requireActiveWorkspace } from "@/lib/auth/session";

const counselingWorkspaces = ["campus_lead", "coach", "counselor"] as const;

export default async function SubmittedHomeworkReviewRoute({ params }: { params: Promise<{ caseId: string; progressId: string }> }) {
  const { caseId, progressId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/cases/${caseId}/homework/${progressId}`);
  if (!counselingWorkspaces.includes(workspace as typeof counselingWorkspaces[number])) redirect("/workspace");

  const [card, review] = await Promise.all([
    getCounselingSessionCard(caseId),
    getCounselorSubmittedHomeworkReview(progressId),
  ]);
  if (!card || !review || review.caseId !== caseId) notFound();
  const partner = card.partners.find(({ id }) => id === review.profileId);
  if (!partner) notFound();
  const partnerName = partner.firstName?.trim() || partner.name;

  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}>
    <SubmittedHomeworkReviewPage review={review} partnerName={partnerName} />
  </WorkspaceShell>;
}
