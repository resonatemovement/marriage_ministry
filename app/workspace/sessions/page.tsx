import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { getCompletedCoupleSessionReview } from "@/features/couple-workspace/queries";
import { CoupleSessionReview } from "@/features/couple-workspace/session-review";
import { requireDefaultWorkspace } from "@/lib/auth/session";

export default async function CoupleSessionsRoute() {
  const { identity } = await requireDefaultWorkspace("/workspace/sessions");
  if (!identity.roles.includes("couple")) redirect("/workspace");
  const data = await getCompletedCoupleSessionReview();
  if (!data) notFound();
  return <WorkspaceShell workspace="couple" activeHref="/workspace" identity={identity}><CoupleSessionReview data={data} /></WorkspaceShell>;
}
