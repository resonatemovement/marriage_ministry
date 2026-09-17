"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import { requireWorkspace } from "@/lib/auth/session";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteAuthIdentity } from "./invitation-delivery";
import { teamDeleteBlockerMessage } from "./person-lifecycle-messages";
import { intakeCoupleDisplayName } from "./types";

type Result = { success: true } | { error: string };
const blocked = "This person cannot be permanently deleted because they have retained ministry history. Deactivate them instead.";

function id(form: FormData) { const value = form.get("profileId"); return typeof value === "string" ? value : ""; }
function groupId(form: FormData) { const value = form.get("groupId"); return typeof value === "string" ? value : ""; }
function adminClient() { const { url } = getSupabaseEnvironment(); const key = process.env.SUPABASE_SECRET_KEY; if (!key) throw new Error("Missing required Supabase server configuration"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }
async function profileDependencies(client: Awaited<ReturnType<typeof createServerSupabaseClient>>, profileId: string) {
  const [memberships, cases, assignments, supervision, leadCoach, leadCounselor, documents] = await Promise.all([
    client.from("group_members").select("id,group_id").eq("profile_id", profileId),
    client.from("counseling_cases").select("id").eq("created_by", profileId),
    client.from("case_assignments").select("id").or(`assigned_by.eq.${profileId},assigned_profile_id.eq.${profileId}`),
    client.from("supervision_assignments").select("id").eq("assigned_by", profileId),
    (client as unknown as { from(table: "campus_lead_coach_assignments"): { select(columns: string): { eq(column: string, value: string): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> } } }).from("campus_lead_coach_assignments").select("id").eq("assigned_by", profileId),
    (client as unknown as { from(table: "campus_lead_counselor_assignments"): { select(columns: string): { eq(column: string, value: string): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> } } }).from("campus_lead_counselor_assignments").select("id").eq("assigned_by", profileId),
    client.from("assessment_documents").select("id").or(`profile_id.eq.${profileId},uploaded_by.eq.${profileId}`),
  ]);
  if ([memberships, cases, assignments, supervision, leadCoach, leadCounselor, documents].some((result) => result.error)) return null;
  return { memberships: memberships.data ?? [], protected: (cases.data?.length ?? 0) + (assignments.data?.length ?? 0) + (supervision.data?.length ?? 0) + (leadCoach.data?.length ?? 0) + (leadCounselor.data?.length ?? 0) + (documents.data?.length ?? 0) };
}

export async function setPersonActive(formData: FormData, active: boolean): Promise<Result> {
  await requireWorkspace("admin", "/people");
  const profileId = id(formData); if (!profileId) return { error: "Choose a person." };
  const client = await createServerSupabaseClient();
  if (!active) {
    const dependencies = await profileDependencies(client, profileId);
    if (!dependencies) return { error: "Person state could not be checked. Please try again." };
    if (dependencies.memberships.length || dependencies.protected) return { error: "This person has active or retained ministry relationships. End those relationships before deactivating them." };
  }
  const { error } = await client.from("profiles").update(active ? { status: "active", deactivated_at: null } : { status: "deactivated", deactivated_at: new Date().toISOString() }).eq("id", profileId);
  if (error) return { error: "The person state could not be updated." };
  revalidatePath("/people"); revalidatePath(`/people/${profileId}`); return { success: true };
}

export async function permanentlyDeletePerson(formData: FormData): Promise<Result> {
  const identity = await requireWorkspace("admin", "/people");
  const profileId = id(formData); if (!profileId) return { error: "Choose a person." };
  if (!identity.roles.includes("super_admin")) return { error: "Only a Super Admin may permanently delete a person." };
  const client = await createServerSupabaseClient();
  const { data: claims } = await client.auth.getClaims();
  if (claims?.claims?.sub === profileId) return { error: "You cannot permanently delete your own account." };
  const dependencies = await profileDependencies(client, profileId);
  if (!dependencies) return { error: "Delete preflight could not be completed. Nothing was deleted." };
  if (dependencies.protected || dependencies.memberships.length) return { error: blocked };
  const { data: profile, error } = await (client as unknown as { from(table: "profiles"): { select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: { photo_path: string | null } | null; error: { message: string } | null }> } } } }).from("profiles").select("photo_path").eq("id", profileId).maybeSingle();
  if (error || !profile) return { error: "This person is no longer available." };
  const removed = await deleteAuthIdentity(profileId);
  if (removed.error) return { error: "The account could not be permanently deleted. Nothing was changed." };
  const storage = adminClient();
  const paths = [...new Set([profile.photo_path, `profiles/${profileId}/avatar.avif`, `profiles/${profileId}/avatar.webp`].filter((path): path is string => Boolean(path)))];
  const photoError = paths.length ? (await storage.storage.from("profile-photos").remove(paths)).error : null;
  revalidatePath("/people");
  return photoError ? { error: "The account was deleted, but profile photo cleanup needs administrator attention." } : { success: true };
}

export async function permanentlyDeleteTeam(formData: FormData): Promise<Result> {
  const identity = await requireWorkspace("admin", "/people");
  if (!identity.roles.includes("super_admin")) return { error: "Only a Super Admin may permanently delete a team." };
  const targetGroupId = groupId(formData); if (!targetGroupId) return { error: "Choose a team." };
  const session = await createServerSupabaseClient(); const { data: claims } = await session.auth.getClaims(); const selfId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  const admin = adminClient();
  const { data: target, error: targetError } = await admin.from("groups").select("group_members(profile_id),invitations(auth_user_id),intake_requests(intake_request_people(person_position,first_name,last_name))").eq("id", targetGroupId).maybeSingle();
  if (targetError || !target) return { error: "Delete preflight could not be completed. Nothing was deleted." };
  const ownedIds = [...new Set([...(target.group_members ?? []).map((member) => member.profile_id), ...(target.invitations ?? []).flatMap((invitation) => invitation.auth_user_id ? [invitation.auth_user_id] : [])])];
  if (selfId && ownedIds.includes(selfId)) return { error: "You cannot permanently delete a team containing your own account." };
  const deleted = await (admin as unknown as { rpc(name: "delete_disposable_team_graph", args: { target_group_id: string }): Promise<{ data: { profile_ids?: string[]; auth_user_ids?: string[] } | null; error: { message: string } | null }> }).rpc("delete_disposable_team_graph", { target_group_id: targetGroupId });
  const intake = target.intake_requests as { intake_request_people?: { person_position?: string | null; first_name?: string | null; last_name?: string | null }[] } | null;
  const intakeCoupleName = intakeCoupleDisplayName((intake?.intake_request_people ?? []).map((person) => ({ firstName: person.first_name ?? null, lastName: person.last_name ?? null, position: person.person_position ?? null })));
  if (deleted.error || !deleted.data) return { error: teamDeleteBlockerMessage(deleted.error?.message ?? "", intakeCoupleName) };
  const profileIds = deleted.data.profile_ids ?? []; const authUserIds = deleted.data.auth_user_ids ?? [];
  const paths = profileIds.flatMap((profileId) => [`profiles/${profileId}/avatar.avif`, `profiles/${profileId}/avatar.webp`]);
  const storage = paths.length ? await admin.storage.from("profile-photos").remove(paths) : { error: null };
  for (const authUserId of authUserIds) { const removed = await deleteAuthIdentity(authUserId); if (removed.error) return { error: "The team record was deleted, but one disposable account could not be removed. Retry account cleanup from support." }; }
  revalidatePath("/people"); return storage.error ? { error: "The team record and accounts were deleted, but profile photo cleanup needs administrator attention." } : { success: true };
}
