import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { calculateDashboardCounts, canReadAdminDashboard, type DashboardCase, type DashboardCounts } from "./data";

type AdminDashboardResult =
  | { counts: DashboardCounts; error: null }
  | { counts: null; error: "unauthorized" | "unavailable" };

export async function getAdminDashboardCounts(): Promise<AdminDashboardResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") return { counts: null, error: "unauthorized" };

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("status").eq("id", profileId).maybeSingle(),
    supabase.from("profile_roles").select("role").eq("profile_id", profileId),
  ]);
  if (profileError || rolesError) return { counts: null, error: "unavailable" };
  if (profile?.status !== "active" || !canReadAdminDashboard(roleRows?.map(({ role }) => role) ?? [])) {
    return { counts: null, error: "unauthorized" };
  }

  const [couplesResult, casesResult] = await Promise.all([
    supabase.from("groups").select("id").eq("group_type", "couple").eq("active", true),
    supabase.from("counseling_cases").select("couple_group_id,status,case_assignments(assignment_type,ended_at)"),
  ]);
  if (couplesResult.error || casesResult.error) return { counts: null, error: "unavailable" };

  return {
    counts: calculateDashboardCounts(
      (couplesResult.data ?? []).map(({ id }) => id),
      (casesResult.data ?? []) as unknown as DashboardCase[],
    ),
    error: null,
  };
}
