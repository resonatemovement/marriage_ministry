import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { CoupleAssessmentExperience } from "@/features/assessments/couple-experience";
import { getCoupleAssessment } from "@/features/assessments/couple-queries";
import { requireDefaultWorkspace } from "@/lib/auth/session";

export default async function CoupleAssessmentRoute({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { identity } = await requireDefaultWorkspace("/workspace/assessments");
  if (!identity.roles.includes("couple")) redirect("/workspace");
  const { assignmentId } = await params;
  const assessment = await getCoupleAssessment(identity.id, assignmentId);
  if (!assessment) notFound();
  return <WorkspaceShell workspace="couple" activeHref="/workspace/assessments" identity={identity}><CoupleAssessmentExperience key={`${assessment.assignmentId}-${assessment.status}-${assessment.attemptId ?? "none"}`} assessment={assessment} /></WorkspaceShell>;
}
