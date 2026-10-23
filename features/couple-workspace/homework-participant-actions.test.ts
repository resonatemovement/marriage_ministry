import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));

import { persistParticipantHomework } from "./homework-participant-actions";

describe("participant Homework assignment actions", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.rpc.mockResolvedValue({ data: "in_progress", error: null });
  });

  it("saves incomplete typed drafts through one atomic RPC call", async () => {
    const answers = {
      "long-answer": "",
      "checkbox-question": ["choice-one"],
      "radio-question": "",
      "optional-checkbox": [],
    };
    const result = await persistParticipantHomework({ progressId: "progress", answers, intent: "save" });
    expect(result).toMatchObject({ success: true, status: "in_progress" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("persist_participant_homework", {
      target_progress_id: "progress",
      target_answers: answers,
      target_intent: "save",
    });
  });

  it("passes optional unanswered selections to the authoritative submit RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: "submitted", error: null });
    const answers = { long: "Ready", checkbox: [], radio: "" };
    const result = await persistParticipantHomework({ progressId: "progress", answers, intent: "submit" });
    expect(result).toMatchObject({ success: true, status: "submitted" });
    expect(mocks.rpc).toHaveBeenCalledWith("persist_participant_homework", {
      target_progress_id: "progress",
      target_answers: answers,
      target_intent: "submit",
    });
  });

  it("submits the current mixed answer payload in the same RPC operation", async () => {
    mocks.rpc.mockResolvedValue({ data: "submitted", error: null });
    const answers = { long: "Current answer", checkbox: ["one", "two"], radio: "three" };
    const result = await persistParticipantHomework({ progressId: "progress", answers, intent: "submit" });
    expect(result).toMatchObject({ success: true, status: "submitted" });
    expect(mocks.rpc).toHaveBeenCalledWith("persist_participant_homework", {
      target_progress_id: "progress",
      target_answers: answers,
      target_intent: "submit",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace");
  });

  it("rejects malformed and duplicate Checkbox values before the RPC", async () => {
    const duplicate = await persistParticipantHomework({ progressId: "progress", answers: { checkbox: ["one", "one"] }, intent: "save" });
    expect(duplicate).toMatchObject({ success: false, error: "Homework assignment is unavailable." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves authoritative incomplete and read-only errors", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Every required Homework response needs a meaningful answer" } });
    await expect(persistParticipantHomework({ progressId: "progress", answers: { required: [] }, intent: "submit" })).resolves.toMatchObject({
      success: false,
      error: "Please complete each required response before submitting.",
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Submitted answers are read-only" } });
    await expect(persistParticipantHomework({ progressId: "progress", answers: { one: "Changed" }, intent: "save" })).resolves.toMatchObject({
      success: false,
      error: "Submitted Homework is read-only.",
    });
  });

  it("does not report success for an invalid RPC response", async () => {
    mocks.rpc.mockResolvedValue({ data: "unexpected", error: null });
    const result = await persistParticipantHomework({ progressId: "progress", answers: { one: "Answer" }, intent: "save" });
    expect(result).toMatchObject({ success: false, error: "Your draft could not be saved.", status: null });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
