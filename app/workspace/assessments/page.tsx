import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { AssessmentList } from "@/features/assessments/couple-experience";
import { getCurrentCoupleAssessmentSummaries } from "@/features/assessments/couple-queries";
import { requireDefaultWorkspace } from "@/lib/auth/session";

export default async function CoupleAssessmentsRoute() {
  const { identity } = await requireDefaultWorkspace("/workspace/assessments");
  if (!identity.roles.includes("couple")) redirect("/workspace");
  const assessments = await getCurrentCoupleAssessmentSummaries(identity.id);
  return <WorkspaceShell workspace="couple" activeHref="/workspace/assessments" identity={identity}><main className="mx-auto max-w-[1100px] space-y-5 p-5 sm:p-8 lg:p-10"><header><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Couple Workspace</p><h1 className="font-heading mt-1 text-3xl font-bold text-text-primary">Assessments</h1><p className="mt-2 text-sm text-text-muted">Complete your assigned Assessments privately at your own pace.</p></header><AssessmentList assessments={assessments} /></main></WorkspaceShell>;
}
