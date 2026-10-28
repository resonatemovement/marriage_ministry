import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { CoupleSessionView } from "@/features/couple-workspace/session-view";
import { getCoupleSessionViewData } from "@/features/couple-workspace/queries";
import { requireDefaultWorkspace } from "@/lib/auth/session";

export default async function CoupleSessionRoute({ params, searchParams }: {
  params: Promise<{ caseSessionId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { caseSessionId } = await params;
  const { tab } = await searchParams;
  const { identity } = await requireDefaultWorkspace(`/workspace/sessions/${caseSessionId}`);
  if (!identity.roles.includes("couple")) redirect("/workspace");
  const session = await getCoupleSessionViewData(identity.id, caseSessionId);
  if (!session) notFound();
  const initialTab = tab === "homework" ? "homework" : "material";
  return <WorkspaceShell workspace="couple" activeHref="/workspace" identity={identity}><CoupleSessionView key={`${caseSessionId}-${initialTab}-${session.homework?.status ?? "none"}`} session={session} initialTab={initialTab} /></WorkspaceShell>;
}
