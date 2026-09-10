import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { IntakeRequestReview } from "@/features/intake-requests/intake-pages";
import { getIntakeRequestDetail } from "@/features/intake-requests/queries";
import { requireWorkspace } from "@/lib/auth/session";

export default async function IntakeRequestDetailRoute({ params }: { params: Promise<{ requestId: string }> }) {
  const [identity, { requestId }] = await Promise.all([requireWorkspace("admin", "/intake-requests"), params]);
  const request = await getIntakeRequestDetail(requestId); if (!request) notFound();
  return <WorkspaceShell workspace="admin" activeHref="/intake-requests" identity={identity}><IntakeRequestReview request={request} isSuperAdmin={identity.roles.includes("super_admin")} /></WorkspaceShell>;
}
