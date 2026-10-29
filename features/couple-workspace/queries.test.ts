import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({ failed: null as "caseResult" | "meetingsResult" | "caseSessionResult" | "homeworkStatusResult" | null }));
const createServerSupabaseClient = vi.hoisted(() => vi.fn());
const getCurrentCoupleCounselor = vi.hoisted(() => vi.fn());
const selection = vi.hoisted(() => ({ homework: "", ownProgressFilter: "", activeCaseSession: true, meetings: [] as Array<Record<string, string | null>> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
vi.mock("@/lib/storage/profile-photo", () => ({ getProfilePhotoUrl: vi.fn() }));
vi.mock("@/features/resource-library/server", () => ({ getResourceDetail: vi.fn(), signedResourceAccess: vi.fn() }));
vi.mock("@/features/counseling-contacts/queries", () => ({ getCurrentCoupleCounselor }));

import { getCoupleWorkspaceData } from "./queries";

const failure = { message: "policy failure", code: "42501", details: "RLS policy denied access", hint: "Review the read policy" };
const caseData: { id: string; status: string; closed_at: string | null; couple: { name: string; group_members: { ended_at: string | null; profile: { id: string; first_name: string; last_name: string; gender: "male" | "female"; email: string; photo_path: null } }[] } } = { id: "case-id", status: "active", closed_at: null, couple: { name: "Alex & Jordan", group_members: [] } };
function result(label: "caseResult" | "meetingsResult" | "caseSessionResult" | "homeworkStatusResult", data: unknown) {
  return Promise.resolve(state.failed === label ? { data: null, error: failure } : { data, error: null });
}

beforeEach(() => {
  state.failed = null;
  caseData.status = "active";
  caseData.closed_at = null;
  caseData.couple = { name: "Alex & Jordan", group_members: [] };
  selection.homework = "";
  selection.ownProgressFilter = "";
  selection.activeCaseSession = true;
  selection.meetings = [{ case_session_id: "case-session-id", session_id: "session-id", starts_at: "2026-10-10T18:00:00.000Z", location: "Fremont", completed_at: null, created_at: "2026-10-09T10:00:00.000Z" }];
  getCurrentCoupleCounselor.mockResolvedValue({ caseId: "case-id", id: "counselor-team", name: "Counselor Team" });
  createServerSupabaseClient.mockResolvedValue({
    rpc: vi.fn(() => Promise.resolve({ data: [{ counseling_case_id: "case-id", campus_lead_name: null, coach_name: null, counselor_name: null, published_session_count: 3 }], error: null })),
    from: vi.fn((table: string) => {
      if (table === "counseling_cases") return { select: () => ({ eq: () => ({ maybeSingle: () => result("caseResult", caseData) }) }) };
      if (table === "case_session_meetings") return { select: () => ({ eq: () => ({ order: () => result("meetingsResult", selection.meetings) }) }) };
      if (table === "case_sessions") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => result("caseSessionResult", selection.activeCaseSession ? { id: "case-session-id", session_id: "session-id", actual_sequence: 1, template_sequence_number: 2, title: "Connection", status: "active", homework_assignment_revision_id: "revision-id" } : null) }) }) }) };
      return { select: (columns: string) => {
        selection.homework = columns;
        return { eq: (column: string, revisionId: string) => ({ eq: (profileColumn: string, profileId: string) => {
          selection.ownProgressFilter = `${column}:${revisionId}|${profileColumn}:${profileId}`;
          return { maybeSingle: () => result("homeworkStatusResult", { status: "in_progress" }) };
        } }) };
      } };
    }),
  });
});

describe("Couple Workspace query diagnostics", () => {
  it("derives completion only from the authoritative finished status", async () => {
    caseData.status = "finished";
    caseData.closed_at = "2026-10-15T22:13:44Z";
    expect((await getCoupleWorkspaceData("partner-one"))?.completed).toBe(true);
    caseData.status = "inactive";
    expect((await getCoupleWorkspaceData("partner-one"))?.completed).toBe(false);
  });

  it("uses active current profiles, not a stale or historical Couple label", async () => {
    caseData.couple = {
      name: "Adam Butcher & Anna Chens",
      group_members: [
        { ended_at: null, profile: { id: "ellen-id", first_name: "Ellen", last_name: "Parker", gender: "female", email: "ellen@example.test", photo_path: null } },
        { ended_at: "2026-01-01T00:00:00Z", profile: { id: "adam-id", first_name: "Adam", last_name: "Butcher", gender: "male", email: "adam@example.test", photo_path: null } },
        { ended_at: null, profile: { id: "matt-id", first_name: "Matt", last_name: "Murdock", gender: "male", email: "matt@example.test", photo_path: null } },
      ],
    };

    const data = await getCoupleWorkspaceData("matt-id");

    expect(data?.coupleName).toBe("Matt Murdock & Ellen Parker");
    expect(data?.partners.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "matt-id", name: "Matt Murdock" },
      { id: "ellen-id", name: "Ellen Parker" },
    ]);
  });

  it("does not query participant Homework assignments when the active Session has no revision", () => {
    const source = readFileSync("features/couple-workspace/queries.ts", "utf8");
    const currentHomework = source.slice(source.indexOf("export async function getCurrentParticipantHomework"));
    expect(currentHomework.indexOf("if (!session.homework_assignment_revision_id) return null;")).toBeGreaterThan(-1);
    expect(currentHomework.indexOf("if (!session.homework_assignment_revision_id) return null;")).toBeLessThan(currentHomework.indexOf("loadParticipantHomework("));
  });

  for (const label of ["caseResult", "meetingsResult", "caseSessionResult", "homeworkStatusResult"] as const) {
    it(`logs ${label} without changing the user-facing error`, async () => {
      state.failed = label;
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      await expect(getCoupleWorkspaceData("partner-one")).rejects.toThrow("Couple Workspace is unavailable");
      expect(errorSpy).toHaveBeenCalledWith(`[Couple Workspace] Query failure: ${label}`, failure);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });
  }

  it("reads only the signed-in partner's progress from the Session's pinned Homework revision", async () => {
    const data = await getCoupleWorkspaceData("partner-one");
    expect(selection.homework).toBe("status");
    expect(selection.ownProgressFilter).toBe("assignment_revision_id:revision-id|profile_id:partner-one");
    expect(data?.homeworkRequired).toBe(true);
    expect(data?.homework).toEqual({ status: "in_progress" });
    expect(data?.homework?.status).not.toBe("submitted");
  });

  it("shows the latest uncompleted follow-up Meeting for the Couple", async () => {
    selection.meetings = [
      { case_session_id: "case-session-id", session_id: "session-id", starts_at: "2026-10-10T18:00:00.000Z", location: "Fremont", completed_at: "2026-10-10T19:00:00.000Z", created_at: "2026-10-09T10:00:00.000Z" },
      { case_session_id: "case-session-id", session_id: "session-id", starts_at: "2026-10-15T18:00:00.000Z", location: "Fremont", completed_at: null, created_at: "2026-10-11T10:00:00.000Z" },
    ];
    const data = await getCoupleWorkspaceData("partner-one");
    expect(data?.nextMeeting).toEqual({ startsAt: "2026-10-15T18:00:00.000Z", location: "Fremont" });
    expect(data?.nextMeeting?.startsAt).not.toBe("2026-10-10T18:00:00.000Z");
  });

  it("shows the scheduled Initial Meeting until completed, then omits it as upcoming", async () => {
    selection.activeCaseSession = false;
    selection.meetings = [{ case_session_id: null, session_id: null, starts_at: "2026-10-10T18:00:00.000Z", location: "Fremont", completed_at: null, created_at: "2026-10-09T10:00:00.000Z" }];
    expect((await getCoupleWorkspaceData("partner-one"))?.nextMeeting?.startsAt).toBe("2026-10-10T18:00:00.000Z");

    selection.meetings[0].completed_at = "2026-10-10T19:00:00.000Z";
    expect((await getCoupleWorkspaceData("partner-one"))?.nextMeeting).toBeNull();
  });

  it("returns a Session overview without fetching Material blocks", async () => {
    const data = await getCoupleWorkspaceData("partner-one");
    expect(data?.caseId).toBe("case-id");
    expect(data?.currentSession).toEqual({ id: "session-id", caseSessionId: "case-session-id", number: 2, actualSequence: 1, title: "Connection" });
    expect(JSON.stringify(data)).not.toContain("case_session_material_blocks");
  });
});
