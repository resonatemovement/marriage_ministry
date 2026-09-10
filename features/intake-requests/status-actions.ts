"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { createAuthIdentityAndSendActivation } from "@/features/people/invitation-delivery";
import { recordInvitationDelivery } from "@/features/people/invitation-actions";

import { isIntakeCloseReason, isIntakeRequestAction } from "./action-model";

type ActionResult = { success: true; delivery?: "complete" | "partial" } | { error: string };
type IntakeActionClient = {
  rpc(name: "take_intake_request_action", args: { target_request_id: string; target_action: string; target_reason_code: string | null; target_reason_detail: string | null }): Promise<{ error: { message: string } | null }>;
  rpc(name: "invite_intake_request", args: { target_request_id: string }): Promise<{ data: { invitation_ids: string[]; created: boolean } | null; error: { message: string } | null }>;
  rpc(name: "record_invitation_auth_identity", args: { target_invitation_id: string; target_auth_user_id: string }): Promise<{ error: { message: string } | null }>;
  rpc(name: "record_invitation_delivery", args: { target_invitation_id: string; target_auth_user_id: string | null; succeeded: boolean; failure_category: string | null }): Promise<{ error: { message: string } | null }>;
  from(name: "invitations"): { select(columns: string): { in(column: string, values: string[]): Promise<{ data: { id: string; email: string }[] | null; error: { message: string } | null }> } };
};

function revalidate(requestId: string) {
  revalidatePath("/intake-requests");
  revalidatePath("/intake-requests/" + requestId);
  revalidatePath("/people");
}

export async function takeIntakeRequestAction(formData: FormData): Promise<ActionResult> {
  await requireWorkspace("admin", "/intake-requests");
  const requestId = String(formData.get("requestId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "");
  const reasonDetail = String(formData.get("reasonDetail") ?? "").trim();
  if (!requestId || !isIntakeRequestAction(action) || action === "send_invite") return { error: "Choose a valid request action." };
  if (action === "close" && (!isIntakeCloseReason(reasonCode) || (reasonCode === "other" && !reasonDetail))) return { error: "Choose a close reason. Add a short explanation for Other." };

  const client = (await createServerSupabaseClient()) as unknown as IntakeActionClient;
  const { error } = await client.rpc("take_intake_request_action", {
    target_request_id: requestId,
    target_action: action,
    target_reason_code: action === "close" ? reasonCode : null,
    target_reason_detail: action === "close" && reasonCode === "other" ? reasonDetail : null,
  });
  if (error) return { error: error.message.includes("valid close reason") ? "Choose a valid close reason." : "Unable to update this request. Please try again." };
  revalidate(requestId);
  return { success: true };
}

export async function sendIntakeRequestInvite(requestId: string): Promise<ActionResult> {
  await requireWorkspace("admin", "/intake-requests");
  if (!requestId) return { error: "This request is no longer available." };
  const client = (await createServerSupabaseClient()) as unknown as IntakeActionClient;
  const { data, error } = await client.rpc("invite_intake_request", { target_request_id: requestId });
  if (error || !data) return { error: "Unable to create this Couple invitation. Review the request and try again." };
  if (!data.created) {
    revalidate(requestId);
    return { success: true };
  }
  const { data: invitations, error: invitationsError } = await client.from("invitations").select("id,email").in("id", data.invitation_ids);
  if (invitationsError || !invitations || invitations.length !== 2) return { error: "The Couple invitation was created, but its delivery records could not be prepared. Use People to resend it." };
  const outcomes = await Promise.all(invitations.map(async (invitation) => {
    const delivery = await createAuthIdentityAndSendActivation(invitation.email);
    return (await recordInvitationDelivery(client as never, invitation.id, delivery)) && delivery.success;
  }));
  revalidate(requestId);
  return { success: true, delivery: outcomes.every(Boolean) ? "complete" : "partial" };
}
