import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminOnboardingReadiness = {
  eligible: boolean;
  stateEligible: boolean;
  missing: string[];
};

function parseReadiness(value: unknown): AdminOnboardingReadiness | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (typeof result.eligible !== "boolean" || typeof result.stateEligible !== "boolean" || !Array.isArray(result.missing)) return null;
  if (!result.missing.every((item) => typeof item === "string")) return null;
  return { eligible: result.eligible, stateEligible: result.stateEligible, missing: result.missing };
}

export async function getAdminOnboardingReadiness(profileId: string): Promise<AdminOnboardingReadiness | null> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("admin_get_onboarding_readiness", { target_profile_id: profileId });
  return error ? null : parseReadiness(data);
}
