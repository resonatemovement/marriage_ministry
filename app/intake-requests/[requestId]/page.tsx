import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { IntakeRequestReview } from "@/features/intake-requests/intake-pages";
import { getIntakeRequestDetail } from "@/features/intake-requests/queries";
import { requireOneOfWorkspaces } from "@/lib/auth/session";

export default async function IntakeRequestDetailRoute({ params }: { params: Promise<{ requestId: string }> }) {
  const [identity, { requestId }] = await Promise.all([requireOneOfWorkspaces(["admin", "campus_lead"], "/intake-requests"), params]);
  const request = await getIntakeRequestDetail(requestId); if (!request) notFound();
  const isAdmin = identity.workspaces.includes("admin");
  return <WorkspaceShell workspace={isAdmin ? "admin" : "campus_lead"} activeHref="/intake-requests" identity={identity}><IntakeRequestReview request={request} canManageIntake canDeleteIntake={identity.roles.includes("super_admin")} /></WorkspaceShell>;
}
