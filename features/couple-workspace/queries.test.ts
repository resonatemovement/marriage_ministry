import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failed: null as "caseResult" | "meetingsResult" | "assignmentResult" | null }));
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const getSessionMaterialBlocks = vi.hoisted(() => vi.fn());
const getCurrentCoupleCounselor = vi.hoisted(() => vi.fn());
const selection = vi.hoisted(() => ({ homework: "", ownProgressFilter: "" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));
vi.mock("@/features/session-builder/queries", () => ({ getSessionMaterialBlocks }));
vi.mock("@/features/counseling-contacts/queries", () => ({ getCurrentCoupleCounselor }));

import { getCoupleWorkspaceData } from "./queries";

const failure = { message: "policy failure", code: "42501", details: "RLS policy denied access", hint: "Review the read policy" };
const caseData = { id: "case-id", status: "active", closed_at: null, couple: { name: "Alex & Jordan", group_members: [] } };
const assignments = [{ homework: { id: "homework-id", session_id: "session-id" }, homework_assignment_revisions: [{ ended_at: null, homework_participant_progress: [
  { profile_id: "partner-two", status: "submitted" },
  { profile_id: "partner-one", status: "in_progress" },
] }] }];

function result(label: "caseResult" | "meetingsResult" | "assignmentResult", data: unknown) {
  return Promise.resolve(state.failed === label ? { data: null, error: failure } : { data, error: null });
}

beforeEach(() => {
  state.failed = null;
  selection.homework = "";
  selection.ownProgressFilter = "";
  getSessionMaterialBlocks.mockResolvedValue([]);
  getCurrentCoupleCounselor.mockResolvedValue({ caseId: "case-id", id: "counselor-team", name: "Counselor Team" });
  createServerSupabaseClient.mockResolvedValue({
    rpc: vi.fn(() => Promise.resolve({ data: [{ counseling_case_id: "case-id", campus_lead_name: null, coach_name: null, counselor_name: null, published_session_count: 3 }], error: null })),
    from: vi.fn((table: string) => {
      if (table === "counseling_cases") return { select: () => ({ eq: () => ({ maybeSingle: () => result("caseResult", caseData) }) }) };
      if (table === "case_session_meetings") return { select: () => ({ eq: () => ({ order: () => result("meetingsResult", [{ session_id: "session-id", starts_at: "2026-10-10T18:00:00.000Z", location: "Fremont" }]) }) }) };
      if (table === "sessions") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "session-id", sequence_number: 1, title: "Connection" }, error: null }) }) }) };
      return { select: (columns: string) => {
        selection.homework = columns;
        return { eq: () => ({ is: () => ({ eq: (column: string, profileId: string) => {
          selection.ownProgressFilter = `${column}:${profileId}`;
          return result("assignmentResult", assignments);
        } }) }) };
      } };
    }),
  });
});

describe("Couple Workspace query diagnostics", () => {
  for (const label of ["caseResult", "meetingsResult", "assignmentResult"] as const) {
    it(`logs ${label} without changing the user-facing error`, async () => {
      state.failed = label;
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(getCoupleWorkspaceData("partner-one")).rejects.toThrow("Couple Workspace is unavailable");
      expect(errorSpy).toHaveBeenCalledWith(`[Couple Workspace] Query failure: ${label}`, failure);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  }

  it("uses real Homework root columns and selects progress by the authenticated partner", async () => {
    const data = await getCoupleWorkspaceData("partner-one");
    expect(selection.homework).toContain("homework:homeworks(id,session_id)");
    expect(selection.homework).not.toContain("title");
    expect(selection.homework).toContain("homework_participant_progress(profile_id,status)");
    expect(selection.ownProgressFilter).toBe("homework_assignment_revisions.homework_participant_progress.profile_id:partner-one");
    expect(data?.homework).toEqual({ title: "Session 1 Homework", status: "in_progress" });
    expect(data?.homework?.status).not.toBe("submitted");
  });
});
