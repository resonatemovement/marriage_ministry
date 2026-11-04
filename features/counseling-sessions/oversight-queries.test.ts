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
    await expect(getCounselingOversightIdentity("case")).resolves.toEqual({ coupleName: "John Lyra & Annie Chung", partners: [
      { id: "john", name: "John Lyra", gender: "male", photoUrl: "signed:profiles/john/avatar.avif" },
      { id: "annie", name: "Annie Chung", gender: "female", photoUrl: "signed:profiles/annie/avatar.avif" },
    ] });
    expect(state.rpc).toHaveBeenCalledWith("get_counseling_workspace_couple_identity", { target_case_id: "case" });
  });

  it("returns no profile details for supervisory-only cases when the existing Case contract denies access", async () => {
    state.rpc.mockResolvedValue({ data: [], error: null });
    await expect(getCounselingOversightIdentity("supervised-case")).resolves.toBeNull();
    expect(state.photo).not.toHaveBeenCalled();
  });
});
