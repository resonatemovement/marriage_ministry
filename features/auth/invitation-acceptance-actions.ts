"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type InvitationAcceptanceResult =
  | { success: true }
  | { success: false; error: "no_session" | "invalid" | "expired" | "revoked" | "identity_mismatch" | "already_accepted" | "unexpected" };

type InvitationAcceptanceError = Extract<InvitationAcceptanceResult, { success: false }>["error"];

type InvitationAcceptanceClient = {
  rpc(
    name: "activate_invitation_account",
    args: Record<string, never>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
};

function acceptanceError(message: string): InvitationAcceptanceError {
  const normalized = message.toLowerCase();

  if (normalized.includes("no authenticated session")) return "no_session";
  if (normalized.includes("revoked")) return "revoked";
  if (normalized.includes("expired")) return "expired";
  if (normalized.includes("belongs to another") || normalized.includes("email does not match")) return "identity_mismatch";
  if (normalized.includes("already belongs")) return "already_accepted";
  if (normalized.includes("not found") || normalized.includes("ambiguous") || normalized.includes("invalid")) return "invalid";

  return "unexpected";
}

export async function acceptInvitation(): Promise<InvitationAcceptanceResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (typeof claims?.claims?.sub !== "string") return { success: false, error: "no_session" };

  const client = supabase as unknown as InvitationAcceptanceClient;
  const { error } = await client.rpc("activate_invitation_account", {});

  return error ? { success: false, error: acceptanceError(error.message) } : { success: true };
}
