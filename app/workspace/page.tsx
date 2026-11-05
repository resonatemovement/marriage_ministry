import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { WorkspacePlaceholder } from "@/features/workspace/workspace-placeholder";
import { SessionsWorkspace } from "@/features/counseling-sessions/sessions-workspace";
import { getCounselingSessionCards } from "@/features/counseling-sessions/queries";
import { getCurrentCampusLeadCoaches, getCurrentCoachCounselors } from "@/features/counseling-sessions/workspace-queries";
import { getCampusLeadCoachNodes, getCoachCounselorNodes } from "@/features/counseling-sessions/oversight-rail-queries";
import { CampusLeadCoachesRail, CoachCounselorsRail } from "@/features/counseling-sessions/workspace-rail";
import { CoupleWorkspace } from "@/features/couple-workspace/workspace";
import { getCoupleWorkspaceData } from "@/features/couple-workspace/queries";
import { getCouplePrepareEnrichDocument } from "@/features/prepare-enrich/server";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function WorkspaceRoute() {
  const { identity, workspace } = await requireActiveWorkspace("/workspace");

  if (workspace === "campus_lead" || workspace === "coach" || workspace === "counselor") {
    if (workspace === "campus_lead") {
      const [cards, coaches] = await Promise.all([getCounselingSessionCards(workspace), getCurrentCampusLeadCoaches()]);
      const coachNodes = await getCampusLeadCoachNodes(coaches);
      return <WorkspaceShell workspace="campus_lead" activeHref="/workspace" identity={identity}><SessionsWorkspace cards={cards} workspaceRail={<CampusLeadCoachesRail coaches={coachNodes} />} /></WorkspaceShell>;
    }
    if (workspace === "coach") {
      const [cards, counselors] = await Promise.all([getCounselingSessionCards(workspace), getCurrentCoachCounselors()]);
      const counselorNodes = await getCoachCounselorNodes(counselors);
      return <WorkspaceShell workspace="coach" activeHref="/workspace" identity={identity}><SessionsWorkspace cards={cards} workspaceRail={<CoachCounselorsRail counselors={counselorNodes} />} isCoachWorkspace /></WorkspaceShell>;
    }
    const cards = await getCounselingSessionCards(workspace);
    return <WorkspaceShell workspace="counselor" activeHref="/workspace" identity={identity}><SessionsWorkspace cards={cards} /></WorkspaceShell>;
  }
  if (workspace === "couple") {
    const [data, prepareEnrich] = await Promise.all([getCoupleWorkspaceData(identity.id), getCouplePrepareEnrichDocument()]);
    return <WorkspaceShell workspace="couple" activeHref="/workspace" identity={identity}><CoupleWorkspace data={data} prepareEnrich={prepareEnrich} /></WorkspaceShell>;
  }
  if (workspace === "admin") redirect("/dashboard");
  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}><WorkspacePlaceholder workspace={workspace} identity={identity} /></WorkspaceShell>;
}
