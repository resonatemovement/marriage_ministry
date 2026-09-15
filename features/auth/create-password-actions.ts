"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
type PasswordClient = {
  rpc(name: "enter_onboarding", args: Record<string, never>): Promise<{ error: { message: string } | null }>;
};

export async function enterOnboardingAfterPassword() {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (typeof claims?.claims?.sub !== "string") return { success: false as const, error: "Sign in through your activation email to continue." };
  const { error: stageError } = await (supabase as unknown as PasswordClient).rpc("enter_onboarding", {});
  if (stageError) return { success: false as const, error: "Your password was saved, but we could not continue setup. Please try again." };
  return { success: true as const };
}
