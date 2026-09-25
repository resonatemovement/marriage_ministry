import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, select, eq, maybeSingle, order } = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), order: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({ rpc, from })) }));

import { initializeHomeworkDraftForSession } from "./queries";

const methods = () => ({ eq, maybeSingle, order });

describe("Homework version initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue({ select });
    select.mockReturnValue(methods());
    eq.mockReturnValue(methods());
  });

  it("reuses an existing Draft and loads persisted blocks", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "homework-id", withdrawn_at: null }, error: null })
      .mockResolvedValueOnce({ data: { version_number: 1 }, error: null });
    order.mockResolvedValueOnce({ data: [{ id: "draft-id", status: "draft", based_on_version_id: "published-id", version_number: null }], error: null })
      .mockResolvedValueOnce({ data: [
        { id: "vb-rich", homework_block_id: "block-rich", block_type: "rich_text", position: 0, title: "Reading", rich_text_content: { type: "doc", content: [] }, url: null, description: null },
        { id: "vb-video", homework_block_id: "block-video", block_type: "video_link", position: 1, title: "Video", rich_text_content: null, url: "https://example.com/video", description: "Watch" },
        { id: "vb-long", homework_block_id: "block-long", block_type: "long_answer", position: 2, title: "Question", rich_text_content: { type: "doc", content: [] }, url: null, description: null },
      ], error: null });
    await expect(initializeHomeworkDraftForSession("session-id", "published")).resolves.toMatchObject({
      draft: { id: "draft-id", status: "draft", basedOnVersionNumber: 1, blocks: [
        { id: "vb-rich", homeworkBlockId: "block-rich", blockType: "rich_text" },
        { id: "vb-video", homeworkBlockId: "block-video", blockType: "video_link" },
        { id: "vb-long", homeworkBlockId: "block-long", blockType: "long_answer" },
      ] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("loads an unassigned Published version without creating an unnecessary Draft", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "homework-id", withdrawn_at: null }, error: null });
    order.mockResolvedValueOnce({ data: [{ id: "published-id", status: "published", based_on_version_id: null, version_number: 2 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await expect(initializeHomeworkDraftForSession("session-id", "published")).resolves.toEqual({
      draft: { id: "published-id", status: "published", basedOnVersionNumber: 2, blocks: [] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not create a Homework root when an empty Published Session opens Homework", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(initializeHomeworkDraftForSession("session-id", "published")).resolves.toEqual({
      draft: { id: null, status: "draft", basedOnVersionNumber: null, blocks: [] },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(order).not.toHaveBeenCalled();
  });

  it("creates or reuses a Draft for a Draft Session and reports stable failures", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "draft-id", status: "draft", based_on_version_id: null, version_number: null }, error: null });
    rpc.mockResolvedValueOnce({ data: "draft-id", error: null });
    order.mockResolvedValueOnce({ data: [], error: null });
    await expect(initializeHomeworkDraftForSession("session-id")).resolves.toMatchObject({ draft: { id: "draft-id", status: "draft", blocks: [] } });
    expect(rpc).toHaveBeenCalledWith("get_or_create_homework_draft_for_session", { target_session_id: "session-id" });

    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(initializeHomeworkDraftForSession("session-id")).resolves.toEqual({ error: "unavailable" });
  });
});
