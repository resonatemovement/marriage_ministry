import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), photo: vi.fn(async (path: string | null) => path ? `signed:${path}` : null) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: (path: string | null) => state.photo(path) }));

import { getCounselingOversightIdentity, getCounselingOversightProgress, getOversightCounselorTeams } from "./oversight-queries";

describe("counseling oversight read contracts", () => {
  beforeEach(() => { state.rpc.mockReset(); state.photo.mockClear(); });

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

  it("uses the existing Case-authorized identity contract and preserves partner ordering", async () => {
    state.rpc.mockResolvedValue({ data: [
      { counseling_case_id: "case", couple_group_id: "couple", group_name: "Stale Label", profile_id: "annie", first_name: "Annie", last_name: "Chung", photo_path: "profiles/annie/avatar.avif", gender: "female" },
      { counseling_case_id: "case", couple_group_id: "couple", group_name: "Stale Label", profile_id: "john", first_name: "John", last_name: "Lyra", photo_path: "profiles/john/avatar.avif", gender: "male" },
    ], error: null });
    await expect(getCounselingOversightIdentity("team", "case")).resolves.toEqual({ coupleName: "John Lyra & Annie Chung", partners: [
      { id: "john", name: "John Lyra", gender: "male", photoUrl: "signed:profiles/john/avatar.avif" },
      { id: "annie", name: "Annie Chung", gender: "female", photoUrl: "signed:profiles/annie/avatar.avif" },
    ] });
    expect(state.rpc).toHaveBeenCalledWith("get_counseling_workspace_couple_identity", { target_case_id: "case" });
  });

  it("uses scoped oversight identity after direct Case identity is denied", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [
        { counseling_case_id: "case", couple_group_id: "couple", group_name: "Couple", profile_id: "partner-a", first_name: "Alex", last_name: "One", photo_path: "profiles/a/avatar.avif", gender: null },
        { counseling_case_id: "case", couple_group_id: "couple", group_name: "Couple", profile_id: "partner-b", first_name: "Blair", last_name: "Two", photo_path: null, gender: null },
      ], error: null });

    await expect(getCounselingOversightIdentity("supervised-team", "case")).resolves.toEqual({
      coupleName: "Alex One & Blair Two",
      partners: [
        { id: "partner-a", name: "Alex One", gender: null, photoUrl: "signed:profiles/a/avatar.avif" },
        { id: "partner-b", name: "Blair Two", gender: null, photoUrl: null },
      ],
    });
    expect(state.rpc).toHaveBeenNthCalledWith(2, "get_counseling_oversight_couple_identity", {
      target_team_id: "supervised-team",
      target_case_id: "case",
    });
    expect(state.photo).toHaveBeenCalledTimes(2);
  });

  it("does not sign photos when both direct and oversight identity contracts deny access", async () => {
    state.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await expect(getCounselingOversightIdentity("unrelated-team", "case")).resolves.toBeNull();
    expect(state.rpc).toHaveBeenNthCalledWith(2, "get_counseling_oversight_couple_identity", {
      target_team_id: "unrelated-team",
      target_case_id: "case",
    });
    expect(state.photo).not.toHaveBeenCalled();
  });
});
