import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, revalidatePath, requireAccess, supabaseClient } = vi.hoisted(() => {
  const client = { rpc: vi.fn(function (this: unknown, ...args: unknown[]) { return rpc.apply(this, args); }) };
  return { rpc: vi.fn(), revalidatePath: vi.fn(), requireAccess: vi.fn(), supabaseClient: client };
});
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => supabaseClient) }));
vi.mock("./access", () => ({ requireSessionBuilderAccess: requireAccess }));

import { saveSessionBuilderState } from "./save-session-state";
import type { SessionEditorState } from "./editor-model";
import { deleteHomeworkBlock, duplicateHomeworkBlock, homeworkEditorStateFromRows, newHomeworkBlock, addHomeworkBlock, reorderHomeworkBlocks, updateHomeworkBlock } from "@/features/homework/homework-editor-model";

const session: SessionEditorState = { sessionId: "session-id", status: "draft", title: "Session", isFinal: false, blocks: [] };
const emptyHomework = homeworkEditorStateFromRows("draft-id", []);

describe("atomic Session and Homework RPC adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("publishes the staged Session and Homework through one transaction RPC", async () => {
    const local = newHomeworkBlock("video_link", 0);
    const homework = addHomeworkBlock(emptyHomework, local);
    const stagedHomework = updateHomeworkBlock(homework, local.key, { title: "Watch", url: "https://example.com/video" });
    rpc.mockResolvedValue({ data: {
      session: { session_id: "session-id", status: "published", title: "Session", is_final: false, blocks: [] },
      homework: { version_id: "published-homework-id", status: "published", version_number: 1, blocks: [
        { id: "snapshot-id", homework_block_id: "logical-id", client_id: local.key, block_type: "video_link", position: 0, title: "Watch", rich_text_content: null, url: "https://example.com/video", description: null },
      ] },
    }, error: null });
    const result = await saveSessionBuilderState(session, stagedHomework, {
      intent: "publish", saveSession: true, saveHomework: true, publishHomework: true,
    });
    expect(requireAccess).toHaveBeenCalledWith("/session-builder/session-id");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseClient.rpc.mock.instances[0]).toBe(supabaseClient);
    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({
      target_session_id: "session-id", target_is_final: false, target_session_intent: "publish",
      save_session: true, save_homework: true, publish_homework: true,
      target_homework_version_id: "draft-id",
      target_homework_blocks: [{ client_id: local.key, block_type: "video_link", title: "Watch", rich_text_content: null, url: "https://example.com/video", description: null }],
    }));
    expect(result).toMatchObject({ sessionState: { status: "published" }, homework: { status: "published", blocks: [{ id: "snapshot-id", clientId: local.key }] } });
  });

  it("publishes a valid Session when no Homework version exists", async () => {
    const page = { key: "local:page", persistedId: null, blockType: "rich_text" as const, title: "Updated Page", richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Current staged content" }] }] }, url: "", description: "" };
    const stagedSession = { ...session, title: "Updated Session", blocks: [page] };
    rpc.mockResolvedValue({ data: {
      session: { session_id: "session-id", status: "published", title: "Updated Session", is_final: true, blocks: [] },
      homework: { version_id: null, status: null, version_number: null, blocks: [] },
    }, error: null });
    const noHomework = { ...homeworkEditorStateFromRows("draft-id", []), versionId: null, versionStatus: null };
    const result = await saveSessionBuilderState({ ...stagedSession, isFinal: true }, noHomework, {
      intent: "publish", saveSession: true, saveHomework: false, publishHomework: true,
    });

    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({
      target_session_intent: "publish", target_is_final: true,
      target_title: "Updated Session",
      target_material: [{ client_id: "local:page", block_type: "rich_text", title: "Updated Page", rich_text_content: page.richTextContent, url: null, description: null }],
      target_homework_version_id: null, target_homework_blocks: [],
      save_homework: false, publish_homework: true,
    }));
    expect(result).toMatchObject({ sessionState: { status: "published", title: "Updated Session", isFinal: true }, homework: { versionId: null, status: null, blocks: [] } });
  });

  it("returns a specific publish validation error and does not issue a second publish request", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Rich Text material cannot be empty" } });
    const result = await saveSessionBuilderState(session, emptyHomework, {
      intent: "publish", saveSession: true, saveHomework: false, publishHomework: true,
    });

    expect(result).toEqual({ error: "Rich Text material cannot be empty", errorKind: "validation" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ target_session_intent: "publish", save_session: true });
  });

  it("uses corrective author-facing copy for an invalid non-null Homework selection", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Select a valid Homework draft or remove the unavailable Homework selection" } });
    const result = await saveSessionBuilderState(session, emptyHomework, {
      intent: "publish", saveSession: true, saveHomework: false, publishHomework: true,
    });
    expect(result).toEqual({ error: "Select a valid Homework draft or remove the unavailable Homework selection", errorKind: "validation" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("uses Session-specific wording for unexpected Publish failures", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "unexpected database detail" } });
    const result = await saveSessionBuilderState(session, emptyHomework, {
      intent: "publish", saveSession: true, saveHomework: false, publishHomework: true,
    });
    expect(result).toEqual({ error: "The Session could not be published. Please try again.", errorKind: "operation" });
    expect(JSON.stringify(result)).not.toContain("Homework could not be saved");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("saves Homework-only edits without rewriting Session state", async () => {
    rpc.mockResolvedValue({ data: {
      session: { session_id: "session-id", status: "published", title: "Session", is_final: false, blocks: [] },
      homework: { version_id: "draft-id", status: "draft", version_number: null, blocks: [] },
    }, error: null });
    const result = await saveSessionBuilderState({ ...session, status: "published" }, emptyHomework, {
      intent: "save", saveSession: false, saveHomework: true, publishHomework: false,
    });
    expect(result).toMatchObject({ sessionState: null, homework: { versionId: "draft-id", status: "draft" } });
    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({
      save_session: false, save_homework: true, publish_homework: false, target_session_intent: "save",
    }));
  });

  it("saves ordered selection-question choices and requiredness through the existing RPC payload", async () => {
    const question = newHomeworkBlock("radio_question", 0);
    const choices = [
      { id: "a8c2aa25-80e6-4bd0-b4f9-9a4f04bd79d2", label: "Choice A" },
      { id: "c79dc958-ea2a-47f2-9a4e-0c0e40dcc94c", label: "Choice B" },
    ];
    const staged = updateHomeworkBlock(addHomeworkBlock(emptyHomework, question), question.key, {
      richTextContent: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Select one" }] }] },
      questionChoices: choices,
      isRequired: false,
    });
    rpc.mockResolvedValue({ data: { session: null, homework: { version_id: "draft-id", status: "draft", version_number: null, blocks: [
      { id: "snapshot", homework_block_id: "logical", client_id: question.key, block_type: "radio_question", position: 0,
        title: null, rich_text_content: staged.blocks[0]!.richTextContent, url: null, description: null,
        question_choices: choices, is_required: false },
    ] } }, error: null });

    const result = await saveSessionBuilderState(session, staged, { intent: "save", saveSession: false, saveHomework: true, publishHomework: false });

    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({
      target_homework_blocks: [{ client_id: question.key, block_type: "radio_question", title: null,
        rich_text_content: staged.blocks[0]!.richTextContent, url: null, description: null,
        question_choices: choices, is_required: false }],
    }));
    expect(result).toMatchObject({ homework: { blocks: [{ questionChoices: choices, isRequired: false, clientId: question.key }] } });
  });

  it("surfaces the database's authoritative selection-question publish validation", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Complete each selection question before publishing" } });
    const result = await saveSessionBuilderState(session, emptyHomework, {
      intent: "publish_changes", saveSession: false, saveHomework: true, publishHomework: true,
    });
    expect(result).toEqual({ error: "Complete each selection question before publishing", errorKind: "validation" });
  });

  it("publishes a saved Homework Draft with unsaved Session changes in one call", async () => {
    rpc.mockResolvedValue({ data: {
      session: { session_id: "session-id", status: "published", title: "Updated title", is_final: false, blocks: [] },
      homework: { version_id: "draft-id", status: "published", version_number: 2, blocks: [] },
    }, error: null });
    await saveSessionBuilderState({ ...session, status: "published", title: "Updated title" }, emptyHomework, {
      intent: "publish_changes", saveSession: true, saveHomework: false, publishHomework: true,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({
      target_session_intent: "publish_changes", save_session: true, save_homework: false, publish_homework: true,
    }));
  });

  it("saves explicit final-session intent through the existing authorized builder transaction", async () => {
    rpc.mockResolvedValue({ data: {
      session: { session_id: "session-id", status: "published", title: "Session", is_final: true, blocks: [] },
      homework: { version_id: "draft-id", status: "published", version_number: 1, blocks: [] },
    }, error: null });
    const result = await saveSessionBuilderState({ ...session, status: "published", isFinal: true }, emptyHomework, {
      intent: "publish_changes", saveSession: true, saveHomework: false, publishHomework: true,
    });
    expect(requireAccess).toHaveBeenCalledWith("/session-builder/session-id");
    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({ target_is_final: true }));
    expect(result).toMatchObject({ sessionState: { isFinal: true } });
  });

  it("sends staged reorder, duplicate, and delete through the existing whole-document save payload", async () => {
    const reading = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Reading body" }] }] };
    const prompt = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Question prompt" }] }] };
    const baseline = homeworkEditorStateFromRows("draft-id", [
      { id: "snapshot-reading", homeworkBlockId: "logical-reading", blockType: "rich_text", position: 0, title: "Reading", richTextContent: reading, url: null, description: null },
      { id: "snapshot-video", homeworkBlockId: "logical-video", blockType: "video_link", position: 1, title: "Watch", richTextContent: null, url: "https://example.com/watch", description: "Watch this" },
      { id: "snapshot-question", homeworkBlockId: "logical-question", blockType: "long_answer", position: 2, title: null, richTextContent: prompt, url: null, description: null },
    ]);
    const reordered = reorderHomeworkBlocks(baseline.blocks, "snapshot-question", "snapshot-reading");
    const copied = duplicateHomeworkBlock(reordered, "snapshot-reading");
    const deleted = deleteHomeworkBlock(copied.blocks, "snapshot-question", "DELETE");
    const staged = { ...baseline, blocks: deleted, editingKey: copied.editingKey };
    const duplicate = deleted.find((block) => block.key === copied.editingKey)!;
    rpc.mockResolvedValue({ data: { session: null, homework: { version_id: "draft-id", status: "draft", version_number: null, blocks: [
      { id: "snapshot-reading", homework_block_id: "logical-reading", block_type: "rich_text", position: 0, title: "Reading", rich_text_content: reading, url: null, description: null },
      { id: "snapshot-copy", homework_block_id: "logical-copy", client_id: duplicate.key, block_type: "rich_text", position: 1, title: "Reading", rich_text_content: reading, url: null, description: null },
      { id: "snapshot-video", homework_block_id: "logical-video", block_type: "video_link", position: 2, title: "Watch", rich_text_content: null, url: "https://example.com/watch", description: "Watch this" },
    ] } }, error: null });

    const result = await saveSessionBuilderState(session, staged, { intent: "save", saveSession: false, saveHomework: true, publishHomework: false });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_session_homework_authoring_state", expect.objectContaining({
      target_homework_blocks: [
        { id: "snapshot-reading", homework_block_id: "logical-reading", block_type: "rich_text", title: "Reading", rich_text_content: reading, url: null, description: null },
        { client_id: duplicate.key, block_type: "rich_text", title: "Reading", rich_text_content: reading, url: null, description: null },
        { id: "snapshot-video", homework_block_id: "logical-video", block_type: "video_link", title: "Watch", rich_text_content: null, url: "https://example.com/watch", description: "Watch this" },
      ],
    }));
    expect(duplicate).toMatchObject({ key: expect.stringMatching(/^local:/), persistedId: null, homeworkBlockId: null });
    expect(result).toMatchObject({ homework: { blocks: [{ id: "snapshot-reading" }, { id: "snapshot-copy", clientId: duplicate.key }, { id: "snapshot-video" }] } });
  });

  it("keeps RPC errors and malformed responses out of success handling", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "rejected" } }).mockResolvedValueOnce({ data: { invalid: true }, error: null });
    const options = { intent: "save" as const, saveSession: true, saveHomework: false, publishHomework: false };
    expect(await saveSessionBuilderState(session, emptyHomework, options)).toHaveProperty("error");
    expect(await saveSessionBuilderState(session, emptyHomework, options)).toHaveProperty("error");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
