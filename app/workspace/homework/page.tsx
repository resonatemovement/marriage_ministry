import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { HomeworkParticipantPage } from "@/features/couple-workspace/homework-participant";
import { getCurrentParticipantHomework } from "@/features/couple-workspace/queries";
import { requireDefaultWorkspace } from "@/lib/auth/session";

export default async function ParticipantHomeworkRoute() {
  const { identity } = await requireDefaultWorkspace("/workspace/homework");
  if (!identity.roles.includes("couple")) redirect("/workspace");
  const homework = await getCurrentParticipantHomework(identity.id);
  return <WorkspaceShell workspace="couple" activeHref="/workspace" identity={identity}><HomeworkParticipantPage homework={homework} /></WorkspaceShell>;
}
