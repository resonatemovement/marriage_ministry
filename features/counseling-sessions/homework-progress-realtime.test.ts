import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeChannel, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { subscribeToHomeworkProgress } from "./homework-progress-realtime";

type ProgressRow = Database["public"]["Tables"]["homework_participant_progress"]["Row"];
type EventCallback = (payload: RealtimePostgresUpdatePayload<ProgressRow>) => void;
type StatusCallback = (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") => void;

function progressRow(assignmentRevisionId: string): ProgressRow {
  return {
    id: "progress-id",
    assignment_revision_id: assignmentRevisionId,
    profile_id: "profile-id",
    status: "submitted",
    submitted_at: "2026-10-19T12:00:00Z",
    reviewed_at: null,
    created_at: "2026-10-19T11:00:00Z",
    updated_at: "2026-10-19T12:00:00Z",
  };
}

function harness() {
  let eventCallback: EventCallback | null = null;
  let statusCallback: StatusCallback | null = null;
  let filter: Record<string, string> | null = null;
  const channel = {
    on: vi.fn((_type: string, nextFilter: Record<string, string>, callback: EventCallback) => {
      filter = nextFilter;
      eventCallback = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: StatusCallback) => {
      statusCallback = callback;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel as unknown as RealtimeChannel),
    removeChannel: vi.fn(async () => "ok"),
  };
  return {
    client,
    channel,
    event: (assignmentRevisionId: string) => eventCallback?.({
      schema: "public",
      table: "homework_participant_progress",
      commit_timestamp: "2026-10-19T12:00:00Z",
      eventType: "UPDATE",
      new: progressRow(assignmentRevisionId),
      old: { id: "progress-id" },
      errors: [],
    }),
    status: (status: Parameters<StatusCallback>[0]) => statusCallback?.(status),
    filter: () => filter,
  };
}

describe("Counselor Homework progress Realtime invalidation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("subscribes once to UPDATE events for the exact active assignment revision", () => {
    const test = harness();
    subscribeToHomeworkProgress({ assignmentRevisionId: "revision-a", client: test.client, refresh: vi.fn() });

    expect(test.client.channel).toHaveBeenCalledOnce();
    expect(test.channel.on).toHaveBeenCalledOnce();
    expect(test.filter()).toEqual({
      event: "UPDATE",
      schema: "public",
      table: "homework_participant_progress",
      filter: "assignment_revision_id=eq.revision-a",
    });
  });

  it("refreshes for its revision, rejects an unrelated revision, and coalesces event bursts", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToHomeworkProgress({ assignmentRevisionId: "revision-a", client: test.client, refresh });

    test.event("revision-other");
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();

    test.event("revision-a");
    test.event("revision-a");
    test.event("revision-a");
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes once after a connected channel recovers without refreshing on initial subscribe", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToHomeworkProgress({ assignmentRevisionId: "revision-a", client: test.client, refresh });

    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();

    test.status("CHANNEL_ERROR");
    test.status("TIMED_OUT");
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();

    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes the channel and cancels a pending refresh on cleanup", () => {
    const test = harness();
    const refresh = vi.fn();
    const cleanup = subscribeToHomeworkProgress({ assignmentRevisionId: "revision-a", client: test.client, refresh });
    test.event("revision-a");

    cleanup();
    test.event("revision-a");
    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();

    expect(test.client.removeChannel).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("replaces an old revision subscription without leaving its timer or channel active", () => {
    const first = harness();
    const second = harness();
    const refresh = vi.fn();
    const cleanupFirst = subscribeToHomeworkProgress({ assignmentRevisionId: "revision-a", client: first.client, refresh });
    first.event("revision-a");
    cleanupFirst();
    subscribeToHomeworkProgress({ assignmentRevisionId: "revision-b", client: second.client, refresh });
    second.event("revision-b");

    vi.runAllTimers();

    expect(first.client.removeChannel).toHaveBeenCalledOnce();
    expect(second.client.channel).toHaveBeenCalledWith("homework-progress:revision-b");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("mounts only for active pinned Homework and exposes neither answers nor toast behavior", () => {
    const page = readFileSync(new URL("./couple-detail-page.tsx", import.meta.url), "utf8");
    const integration = readFileSync(new URL("./homework-progress-realtime.tsx", import.meta.url), "utf8");

    expect(page).toContain('card.state.caseSession?.status === "active"');
    expect(page).toContain("card.state.caseSession.homeworkAssignmentRevisionId");
    expect(page).toContain("activeHomeworkRevisionId ? <HomeworkProgressRealtime");
    expect(integration).not.toContain("homework_answers");
    expect(integration).not.toContain("answer_text");
    expect(integration).not.toContain("showSuccessToast");
    expect(integration).not.toContain("showErrorToast");
  });
});
