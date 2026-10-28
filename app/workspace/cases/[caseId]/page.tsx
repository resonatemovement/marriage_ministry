import { notFound, redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { CounselingCoupleDetailPage } from "@/features/counseling-sessions/couple-detail-page";
import { getCounselingSessionCard } from "@/features/counseling-sessions/queries";
import { requireActiveWorkspace } from "@/lib/auth/session";
import { getCounselorPrepareEnrichDocument } from "@/features/prepare-enrich/server";
import { isDevCounselingProject } from "@/features/counseling-sessions/dev-reset";
import { getMeetingNotificationRows } from "@/features/notifications/meeting-notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const counselingWorkspaces = ["campus_lead", "coach", "counselor"] as const;

export default async function CounselingCaseDetailRoute({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const { identity, workspace } = await requireActiveWorkspace(`/workspace/cases/${caseId}`);
  const isAdmin = identity.roles.some((role) => role === "admin" || role === "super_admin");
  const canResetCounselingJourney = identity.roles.includes("super_admin") && isDevCounselingProject();
  if (!isAdmin && !counselingWorkspaces.includes(workspace as typeof counselingWorkspaces[number])) redirect("/workspace");
  const card = await getCounselingSessionCard(caseId);
  if (!card) notFound();
  const prepareEnrich = await getCounselorPrepareEnrichDocument(caseId);
  const meetingNotifications = card.state.meeting ? await getMeetingNotificationRows(caseId, card.state.meeting.id) : [];
  const supabase = await createServerSupabaseClient();
  const { data: canReopenHomework } = await supabase.rpc("get_homework_reopen_eligibility", { target_case_id: caseId });
  return <WorkspaceShell workspace={workspace} activeHref="/workspace" identity={identity}><CounselingCoupleDetailPage card={card} prepareEnrich={prepareEnrich} isAdmin={isAdmin} canReopenHomework={canReopenHomework === true} canResetCounselingJourney={canResetCounselingJourney} meetingNotifications={meetingNotifications} /></WorkspaceShell>;
}
