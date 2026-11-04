import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: state.rpc }) }));

import { getCounselingOversightProgress, getOversightCounselorTeams } from "./oversight-queries";

describe("counseling oversight read contracts", () => {
  beforeEach(() => state.rpc.mockReset());

  it("requests only a team-scoped progress projection and maps its safe fields", async () => {
    state.rpc.mockResolvedValue({ data: [{ team_id: "team", team_name: "Counselor Team", counseling_case_id: "case", couple_group_id: "couple", couple_name: "A & B", case_status: "active", session_progress: "Session 2 of 8", next_meeting_at: null, homework_status: "Complete" }], error: null });
    await expect(getCounselingOversightProgress("team")).resolves.toEqual([{ teamId: "team", teamName: "Counselor Team", caseId: "case", coupleId: "couple", coupleName: "A & B", caseStatus: "active", sessionProgress: "Session 2 of 8", nextMeetingAt: null, homeworkStatus: "Complete" }]);
    expect(state.rpc).toHaveBeenCalledWith("get_counseling_oversight_progress", { target_team_id: "team" });
  });

  it("returns no progress rows for a team outside the database-authorized hierarchy", async () => {
    state.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getCounselingOversightProgress("unrelated-team")).resolves.toEqual([]);
  });

  it("fails closed when the database summary contract is unavailable", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "not authorized" } });
    await expect(getCounselingOversightProgress("team")).rejects.toThrow("Counseling progress is unavailable");
  });

  it("requests only active authorized subordinate team identities", async () => {
    state.rpc.mockResolvedValue({ data: [{ id: "counselor", name: "Counselors", campus_name: "Oakland" }], error: null });
    await expect(getOversightCounselorTeams("coach")).resolves.toEqual([{ id: "counselor", name: "Counselors", campus: "Oakland" }]);
    expect(state.rpc).toHaveBeenCalledWith("get_oversight_counselor_teams", { target_coach_team_id: "coach" });
  });
});
