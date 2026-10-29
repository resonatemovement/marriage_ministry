import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), requireRoles: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles: mock.requireRoles }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mock.rpc }) }));

import { rescheduleCaseAssessment, saveCaseAssessmentSchedule, saveCounselorAssessmentPreference } from "./counselor-management-actions";

const caseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const assessmentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const versionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Counselor Assessment management actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockResolvedValue({ error: null }); });

  it("saves a Counselor preference through its own authorized RPC", async () => {
    await expect(saveCounselorAssessmentPreference(assessmentId, sessionId)).resolves.toEqual({ success: true });
    expect(mock.requireRoles).toHaveBeenCalledWith(["counselor"], "/workspace");
    expect(mock.rpc).toHaveBeenCalledWith("set_assessment_counselor_preference", { target_assessment_id: assessmentId, target_session_id: sessionId });
  });

  it("routes Case scheduling only through the existing authorized schedule RPC", async () => {
    await expect(saveCaseAssessmentSchedule(caseId, assessmentId, versionId, null)).resolves.toEqual({ success: true });
    expect(mock.requireRoles).toHaveBeenCalledWith(["counselor", "admin", "super_admin"], `/workspace/cases/${caseId}`);
    expect(mock.rpc).toHaveBeenCalledWith("configure_case_assessment_schedule", {
      target_case_id: caseId, target_assessment_id: assessmentId, target_version_id: versionId,
    });
  });

  it("routes existing schedules through the pinned-version-preserving reschedule RPC", async () => {
    await expect(rescheduleCaseAssessment(caseId, assessmentId, sessionId)).resolves.toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("reschedule_case_assessment_schedule", {
      target_case_id: caseId, target_assessment_id: assessmentId, target_session_id: sessionId,
    });
  });

  it("rejects malformed identifiers before making a database call", async () => {
    await expect(saveCaseAssessmentSchedule("not-a-case", assessmentId, versionId, sessionId)).resolves.toHaveProperty("error");
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("returns a safe failure when the database authorization contract rejects a change", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "42501" } });
    await expect(saveCaseAssessmentSchedule(caseId, assessmentId, versionId, sessionId)).resolves.toHaveProperty("error");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
