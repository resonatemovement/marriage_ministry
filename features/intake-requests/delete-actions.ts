"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { deleteAuthIdentity } from "@/features/people/invitation-delivery";

type Result = { success: true } | { error: string };
const intakeBlockerMessages: Record<string, string> = { counseling_case_history: "This Intake Request’s generated Couple has retained counseling case history and cannot be permanently deleted.", counselor_assignment_history: "This Intake Request’s generated Couple has retained Counselor-of-record assignment history and cannot be permanently deleted.", assessment_documents: "This Intake Request’s generated Couple has assessment history and cannot be permanently deleted.", member_in_another_active_team: "A generated Couple member belongs to another active team, so this Intake Request cannot be permanently deleted.", generated_couple_not_exclusively_owned: "The generated Couple is no longer exclusively owned by this Intake Request and cannot be permanently deleted." };
function intakeDeleteMessage(error: string) { const code = error.match(/intake_delete_blocker:([a-z_]+)/)?.[1]; return code ? intakeBlockerMessages[code] ?? "This Intake Request has protected downstream history and cannot be permanently deleted." : "Unable to permanently delete this Intake Request. Please try again."; }
function adminClient() { const { url } = getSupabaseEnvironment(); const key = process.env.SUPABASE_SECRET_KEY; if (!key) throw new Error("Missing required Supabase server configuration"); return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); }

export async function deleteIntakeRequest(requestId: string): Promise<Result> {
  const identity = await requireWorkspace("admin", "/intake-requests");
  if (!identity.roles.includes("super_admin")) return { error: "Only Super Admins may permanently delete Intake Requests." };
  if (!requestId) return { error: "This Intake Request is no longer available." };
  const admin = adminClient();
  const deleted = await (admin as unknown as { rpc(name: "delete_disposable_intake_graph", args: { target_intake_id: string }): Promise<{ data: { profile_ids?: string[]; auth_user_ids?: string[] } | null; error: { message: string } | null }> }).rpc("delete_disposable_intake_graph", { target_intake_id: requestId });
  if (deleted.error || !deleted.data) return { error: intakeDeleteMessage(deleted.error?.message ?? "") };
  const profileIds = deleted.data.profile_ids ?? []; const authUserIds = deleted.data.auth_user_ids ?? [];
  const storage = profileIds.length ? await admin.storage.from("profile-photos").remove(profileIds.flatMap((profileId) => [`profiles/${profileId}/avatar.avif`, `profiles/${profileId}/avatar.webp`])) : { error: null };
  for (const authUserId of authUserIds) { const removed = await deleteAuthIdentity(authUserId); if (removed.error) return { error: "The Intake Request was deleted, but one disposable account could not be removed. Retry account cleanup from support." }; }
  revalidatePath("/intake-requests");
  revalidatePath(`/intake-requests/${requestId}`);
  return storage.error ? { error: "The Intake Request was deleted, but profile photo cleanup needs administrator attention." } : { success: true };
}
