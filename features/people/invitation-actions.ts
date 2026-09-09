"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  authIdentityMatchesInvitation,
  createAuthIdentityAndSendActivation,
  deleteAuthIdentity,
  type InvitationDeliveryFailure,
} from "./invitation-delivery";
import { validateInvitation } from "./invitation-validation";

type Result = { success: true; names: string[]; delivery: "complete" | "partial" } | { error: string };
type DeliveryRpcClient = {
  rpc(name: "record_invitation_auth_identity", args: { target_invitation_id: string; target_auth_user_id: string }): Promise<{ error: { message: string } | null }>;
  rpc(name: "record_invitation_auth_reset", args: { target_invitation_id: string }): Promise<{ error: { message: string } | null }>;
  rpc(name: "record_invitation_delivery", args: { target_invitation_id: string; target_auth_user_id: string | null; succeeded: boolean; failure_category: string | null }): Promise<{ error: { message: string } | null }>;
  rpc(name: "record_invitation_resend", args: { target_invitation_id: string }): Promise<{ error: { message: string } | null }>;
};
type InvitationRpcClient = DeliveryRpcClient & {
  rpc(name: "create_invitations", args: { payload: Record<string, unknown> }): Promise<{ data: { invitation_ids: string[]; group_id: string | null } | null; error: { message: string } | null }>;
};
type InvitationRow = { id: string; email: string; first_name: string; last_name: string; status: string; group_id: string | null; campus_id: string; intended_role: string; auth_user_id: string | null };
type RestartableProfile = { status: string; onboarding_completed_at: string | null; phone: string | null; photo_path: string | null; email: string | null; campus_id: string | null };
type ResendClient = InvitationRpcClient & {
  from(name: "invitations"): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: InvitationRow | null; error: { message: string } | null }> } } };
  from(name: "profiles"): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: RestartableProfile | null; error: { message: string } | null }> } } };
  from(name: "profile_roles"): { select(columns: string): { eq(column: string, value: string): Promise<{ data: { role: string }[] | null; error: { message: string } | null }> } };
  from(name: "group_members"): { select(columns: string): { eq(column: string, value: string): { is(column: string, value: null): Promise<{ data: { group_id: string }[] | null; error: { message: string } | null }> } } };
};

function deliveryError(category: InvitationDeliveryFailure) {
  return category === "rate_limited"
    ? "Delivery could not be attempted right now. Please try again shortly."
    : "The invitation remains pending, but delivery could not be completed.";
}

async function recordDelivery(client: DeliveryRpcClient, invitationId: string, result: Awaited<ReturnType<typeof createAuthIdentityAndSendActivation>>) {
  if (result.authUserId) {
    const identity = await client.rpc("record_invitation_auth_identity", { target_invitation_id: invitationId, target_auth_user_id: result.authUserId });
    if (identity.error) return false;
  }
  const delivery = await client.rpc("record_invitation_delivery", {
    target_invitation_id: invitationId,
    target_auth_user_id: result.authUserId,
    succeeded: result.success,
    failure_category: result.success ? null : result.category,
  });
  return !delivery.error;
}

function safelyRestartable(
  invitation: InvitationRow,
  profile: RestartableProfile | null,
  roles: { role: string }[],
  memberships: { group_id: string }[],
) {
  if (invitation.status !== "pending") return false;
  if (!profile) return true;
  if (profile.status !== "invited" || profile.onboarding_completed_at || profile.phone || profile.photo_path) return false;
  if (profile.email?.toLowerCase() !== invitation.email) return false;
  // A stale profile may predate role/group provisioning. Only allow no access or exactly the expected access.
  if (roles.length > 1 || (roles.length === 1 && roles[0]?.role !== invitation.intended_role)) return false;
  return invitation.group_id
    ? memberships.length === 0 || (memberships.length === 1 && memberships[0]?.group_id === invitation.group_id)
    : memberships.length === 0;
}

export async function resendPeopleInvitation(invitationId: string): Promise<{ success: true; name: string } | { error: string; recoveryRequired?: boolean }> {
  await requireWorkspace("admin", "/people");
  const client = (await createServerSupabaseClient()) as unknown as ResendClient;
  const { data: invitation, error } = await client.from("invitations").select("id,email,first_name,last_name,status,group_id,campus_id,intended_role,auth_user_id").eq("id", invitationId).maybeSingle();
  if (error || !invitation || invitation.status !== "pending") return { error: "This invitation is no longer available to resend." };
  const profileState: [
    { data: RestartableProfile | null; error: { message: string } | null },
    { data: { role: string }[] | null; error: { message: string } | null },
    { data: { group_id: string }[] | null; error: { message: string } | null },
  ] = invitation.auth_user_id
    ? await Promise.all([
      client.from("profiles").select("status,onboarding_completed_at,phone,photo_path,email,campus_id").eq("id", invitation.auth_user_id).maybeSingle(),
      client.from("profile_roles").select("role").eq("profile_id", invitation.auth_user_id),
      client.from("group_members").select("group_id").eq("profile_id", invitation.auth_user_id).is("ended_at", null),
    ])
    : [{ data: null, error: null }, { data: [], error: null }, { data: [], error: null }];
  const [profileResult, rolesResult, membershipsResult] = profileState;
  const { data: profile, error: profileError } = profileResult;
  if (profileError) return { error: "This account requires account recovery or resume assistance.", recoveryRequired: true };
  if (rolesResult.error || membershipsResult.error || !safelyRestartable(invitation, profile, rolesResult.data ?? [], membershipsResult.data ?? [])) {
    return { error: "This account has already begun setup and requires account recovery or resume assistance.", recoveryRequired: true };
  }

  if (invitation.auth_user_id) {
    if (!await authIdentityMatchesInvitation(invitation.auth_user_id, invitation.email)) return { error: "This account requires account recovery or resume assistance.", recoveryRequired: true };
    const removed = await deleteAuthIdentity(invitation.auth_user_id);
    if (removed.error) return { error: "The invitation remains pending, but its previous account setup could not be reset." };
    const reset = await client.rpc("record_invitation_auth_reset", { target_invitation_id: invitation.id });
    if (reset.error) return { error: "The invitation remains pending, but its previous account setup could not be reset." };
  }

  const result = await createAuthIdentityAndSendActivation(invitation.email);
  const recorded = await recordDelivery(client, invitation.id, result);
  if (!recorded || !result.success) return { error: deliveryError(result.success ? "provider_unavailable" : result.category) };
  const resend = await client.rpc("record_invitation_resend", { target_invitation_id: invitation.id });
  if (resend.error) return { error: "The activation email was sent, but its delivery record could not be updated." };
  revalidatePath("/people");
  return { success: true, name: `${invitation.first_name} ${invitation.last_name}`.trim() || invitation.email };
}

export async function createPeopleInvitations(formData: FormData): Promise<Result> {
  const identity = await requireWorkspace("admin", "/people");
  const role = String(formData.get("role") ?? "");
  const campusId = String(formData.get("campusId") ?? "").trim();
  const grouped = ["couple", "coach", "counselor"].includes(role);
  const invitees = Array.from({ length: grouped ? 2 : 1 }, (_, index) => ({
    first_name: String(formData.get(`firstName${index}`) ?? "").trim(), last_name: String(formData.get(`lastName${index}`) ?? "").trim(), email: String(formData.get(`email${index}`) ?? "").trim().toLowerCase(),
  }));
  if (role === "super_admin" && !identity.roles.includes("super_admin")) return { error: "Only a Super Admin may invite another Super Admin." };
  const validation = validateInvitation(role, campusId, invitees.map((item) => ({ firstName: item.first_name, lastName: item.last_name, email: item.email })));
  if (Object.keys(validation).length) return { error: Object.values(validation)[0]! };
  const client = (await createServerSupabaseClient()) as unknown as InvitationRpcClient;
  const { data, error } = await client.rpc("create_invitations", { payload: { role, campus_id: campusId, invitees } });
  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("already exists")) return { error: "An active user or pending invitation already exists for this email." };
    if (message.includes("active campus")) return { error: "Choose an active Campus." };
    return { error: "The invitation could not be created. Please review the details and try again." };
  }
  const outcomes = await Promise.all(data.invitation_ids.map(async (invitationId, index) => {
    const result = await createAuthIdentityAndSendActivation(invitees[index]!.email);
    return (await recordDelivery(client, invitationId, result)) && result.success;
  }));
  revalidatePath("/people");
  const delivered = outcomes.filter(Boolean).length;
  if (!delivered) return { error: "The invitations were created, but delivery could not be completed. They can be retried later." };
  return { success: true, names: invitees.map((item) => `${item.first_name} ${item.last_name}`), delivery: delivered === invitees.length ? "complete" : "partial" };
}
