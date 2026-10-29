import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath } = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc }) }));

import { saveCoupleAssessmentResponse, startCoupleAssessment, submitCoupleAssessment } from "./couple-actions";

const assignmentId = "4e50bdf3-6839-4d43-a8f6-042ff724fb85";
const attemptId = "4e50bdf3-6839-4d43-a8f6-042ff724fb86";
const questionId = "4e50bdf3-6839-4d43-a8f6-042ff724fb87";
const choiceId = "4e50bdf3-6839-4d43-a8f6-042ff724fb88";

describe("Couple Assessment server actions", () => {
  beforeEach(() => { rpc.mockReset(); revalidatePath.mockReset(); });

  it("starts only the idempotent initial participant attempt", async () => {
    rpc.mockResolvedValue({ data: attemptId, error: null });
    await expect(startCoupleAssessment(assignmentId)).resolves.toMatchObject({ success: true, attemptId });
    expect(rpc).toHaveBeenCalledWith("start_assessment_attempt", { target_participant_assignment_id: assignmentId, voluntary_retake: false });
  });

  it("saves a single response only through the existing owner-authorized RPC", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(saveCoupleAssessmentResponse({ attemptId, questionId, choiceId })).resolves.toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith("save_assessment_response", { target_attempt_id: attemptId, target_question_id: questionId, target_choice_id: choiceId });
  });

  it("submits to server-calculated scoring and rejects duplicate malformed input before RPC", async () => {
    rpc.mockResolvedValue({ data: [{ category_key: "synthetic", category_label: "Synthetic", score: 1, rank: 1, is_primary: true }], error: null });
    await expect(submitCoupleAssessment(attemptId)).resolves.toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith("submit_assessment_attempt", { target_attempt_id: attemptId });
    rpc.mockClear();
    await expect(submitCoupleAssessment("not-an-id")).resolves.toMatchObject({ success: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not report an autosave as successful if the database rejects it", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "read only" } });
    await expect(saveCoupleAssessmentResponse({ attemptId, questionId, choiceId })).resolves.toMatchObject({ success: false });
  });
});
