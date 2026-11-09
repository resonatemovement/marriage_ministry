import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ error: null as { message: string } | null, rpc: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ rpc: state.rpc })),
}));

import { updateCounselingTeamAvailability } from "./team-availability-actions";

describe("updateCounselingTeamAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("persists the requested value through the narrow database authorization function", async () => {
    await expect(updateCounselingTeamAvailability("72bb363b-6c4a-4a29-8a29-3c2c0319b1ec", false)).resolves.toEqual({ success: true });
    expect(state.rpc).toHaveBeenCalledWith("set_my_counseling_team_availability", {
      target_team_id: "72bb363b-6c4a-4a29-8a29-3c2c0319b1ec",
      target_accepting_new_couples: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workspace");
  });

  it("rejects invalid input before making a database request", async () => {
    await expect(updateCounselingTeamAvailability("not-a-team-id", false)).resolves.toHaveProperty("error");
    await expect(updateCounselingTeamAvailability("72bb363b-6c4a-4a29-8a29-3c2c0319b1ec", "false" as never)).resolves.toHaveProperty("error");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("returns a safe failure without revalidating when the database denies or fails the update", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "Not authorized" } });
    await expect(updateCounselingTeamAvailability("72bb363b-6c4a-4a29-8a29-3c2c0319b1ec", false)).resolves.toEqual({ error: "Team availability could not be saved. Please try again." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
