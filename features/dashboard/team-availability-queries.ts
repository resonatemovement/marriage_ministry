import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canReadSharedDashboard } from "./data";
import { mapDashboardAvailabilityTeams, type DashboardAvailabilityTeam } from "./team-availability";

export type DashboardTeamAvailabilityResult = {
  teams: DashboardAvailabilityTeam[] | null;
  error: "unauthorized" | "unavailable" | null;
};

export async function getDashboardTeamAvailability(): Promise<DashboardTeamAvailabilityResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (claimsError || typeof profileId !== "string") return { teams: null, error: "unauthorized" };

  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from("profiles").select("status").eq("id", profileId).maybeSingle(),
    supabase.from("profile_roles").select("role").eq("profile_id", profileId),
  ]);
  if (profileError || roleError) return { teams: null, error: "unavailable" };
  const roles = roleRows?.map(({ role }) => role) ?? [];
  if (profile?.status !== "active" || !canReadSharedDashboard(roles)) return { teams: null, error: "unauthorized" };

  const { data, error } = await supabase.rpc("get_dashboard_team_availability");
  if (error || !Array.isArray(data)) return { teams: null, error: "unavailable" };

  const teams = mapDashboardAvailabilityTeams(data);
  return { teams, error: null };
}
