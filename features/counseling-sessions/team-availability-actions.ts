"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function updateCounselingTeamAvailability(teamId: string, acceptingNewCouples: boolean) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId) || typeof acceptingNewCouples !== "boolean") {
    return { error: "Team availability could not be saved." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_my_counseling_team_availability", {
    target_team_id: teamId,
    target_accepting_new_couples: acceptingNewCouples,
  });
  if (error) return { error: "Team availability could not be saved. Please try again." };

  revalidatePath("/workspace");
  return { success: true };
}
