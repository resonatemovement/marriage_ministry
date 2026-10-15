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

  it("saves partial and multiple answers through one atomic RPC call", async () => {
    const answers = { "block-one": "First", "block-two": "" };
    const result = await persistParticipantHomework({ progressId: "progress", answers, intent: "save" });
    expect(result).toMatchObject({ success: true, status: "in_progress" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("persist_participant_homework", { target_progress_id: "progress", target_answers: answers, target_intent: "save" });
  });

  it("returns inline errors without persisting an incomplete submission", async () => {
    const result = await persistParticipantHomework({ progressId: "progress", answers: { one: "Ready", two: " " }, intent: "submit" });
    expect(result).toMatchObject({ success: false, fieldErrors: { two: "A response is required." } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("submits unsaved answers in the same RPC operation", async () => {
    mocks.rpc.mockResolvedValue({ data: "submitted", error: null });
    const answers = { one: "Current answer", two: "Another current answer" };
    const result = await persistParticipantHomework({ progressId: "progress", answers, intent: "submit" });
    expect(result).toMatchObject({ success: true, status: "submitted" });
    expect(mocks.rpc).toHaveBeenCalledWith("persist_participant_homework", { target_progress_id: "progress", target_answers: answers, target_intent: "submit" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/workspace");
  });

  it("preserves read-only errors returned by the authoritative RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Submitted answers are read-only" } });
    const result = await persistParticipantHomework({ progressId: "progress", answers: { one: "Changed" }, intent: "save" });
    expect(result).toMatchObject({ success: false, error: "Submitted Homework is read-only." });
  });
});
