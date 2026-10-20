import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { subscribeToCaseMeetings } from "./meeting-realtime";

type MeetingRow = Database["public"]["Tables"]["case_session_meetings"]["Row"];
type MeetingPayload = RealtimePostgresInsertPayload<MeetingRow> | RealtimePostgresUpdatePayload<MeetingRow>;
type EventCallback = (payload: MeetingPayload) => void;
type StatusCallback = (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") => void;

function meetingRow(caseId: string): MeetingRow {
  return {
    id: "meeting-id",
    counseling_case_id: caseId,
    case_session_id: null,
    session_id: null,
    starts_at: "2026-10-21T22:00:00Z",
    ends_at: "2026-10-21T23:00:00Z",
    location: "In person",
    scheduled_by: "counselor-id",
    completed_at: null,
    completed_by: null,
    created_at: "2026-10-20T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
  };
}

function harness() {
  const callbacks = new Map<"INSERT" | "UPDATE", EventCallback>();
  let statusCallback: StatusCallback | null = null;
  const filters: Array<Record<string, string>> = [];
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, string>, callback: EventCallback) => {
      filters.push(filter);
      callbacks.set(filter.event as "INSERT" | "UPDATE", callback);
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
    filters,
    event: (event: "INSERT" | "UPDATE", caseId: string) => callbacks.get(event)?.({
      schema: "public",
      table: "case_session_meetings",
      commit_timestamp: "2026-10-20T12:00:00Z",
      eventType: event,
      new: meetingRow(caseId),
      old: event === "UPDATE" ? { id: "meeting-id" } : {},
      errors: [],
    } as MeetingPayload),
    status: (status: Parameters<StatusCallback>[0]) => statusCallback?.(status),
  };
}

describe("Meeting Realtime invalidation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uses one channel with exact case-scoped INSERT and UPDATE subscriptions", () => {
    const test = harness();
    subscribeToCaseMeetings({ caseId: "case-a", client: test.client, refresh: vi.fn() });

    expect(test.client.channel).toHaveBeenCalledOnce();
    expect(test.client.channel).toHaveBeenCalledWith("case-meetings:case-a");
    expect(test.channel.on).toHaveBeenCalledTimes(2);
    expect(test.filters).toEqual([
      { event: "INSERT", schema: "public", table: "case_session_meetings", filter: "counseling_case_id=eq.case-a" },
      { event: "UPDATE", schema: "public", table: "case_session_meetings", filter: "counseling_case_id=eq.case-a" },
    ]);
  });

  it.each(["INSERT", "UPDATE"] as const)("refreshes for a matching %s", (event) => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseMeetings({ caseId: "case-a", client: test.client, refresh });

    test.event(event, "case-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects unrelated payloads and coalesces event bursts", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseMeetings({ caseId: "case-a", client: test.client, refresh });

    test.event("UPDATE", "case-other");
    test.event("INSERT", "case-a");
    test.event("UPDATE", "case-a");
    test.event("UPDATE", "case-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after reconnect without refreshing on initial subscribe", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseMeetings({ caseId: "case-a", client: test.client, refresh });

    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();

    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes the channel and cancels pending work on unmount", () => {
    const test = harness();
    const refresh = vi.fn();
    const cleanup = subscribeToCaseMeetings({ caseId: "case-a", client: test.client, refresh });
    test.event("UPDATE", "case-a");

    cleanup();
    test.event("INSERT", "case-a");
    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();

    expect(test.client.removeChannel).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("replaces a case subscription without retaining its timer or channel", () => {
    const first = harness();
    const second = harness();
    const refresh = vi.fn();
    const cleanup = subscribeToCaseMeetings({ caseId: "case-a", client: first.client, refresh });
    first.event("UPDATE", "case-a");
    cleanup();
    subscribeToCaseMeetings({ caseId: "case-b", client: second.client, refresh });
    second.event("INSERT", "case-b");
    vi.runAllTimers();

    expect(first.client.removeChannel).toHaveBeenCalledOnce();
    expect(second.client.channel).toHaveBeenCalledWith("case-meetings:case-b");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("mounts on authorized case views without notification, mutation, or toast side effects", () => {
    const counselor = readFileSync(new URL("./couple-detail-page.tsx", import.meta.url), "utf8");
    const couple = readFileSync(new URL("../couple-workspace/workspace.tsx", import.meta.url), "utf8");
    const integration = readFileSync(new URL("./meeting-realtime.tsx", import.meta.url), "utf8");

    expect(counselor).toContain("<MeetingRealtime caseId={card.caseId}");
    expect(couple).toContain("<MeetingRealtime caseId={data.caseId}");
    expect(couple.indexOf("if (!data) return")).toBeLessThan(couple.indexOf("<MeetingRealtime caseId={data.caseId}"));
    expect(integration).not.toMatch(/dispatchMeetingNotifications|resendMeetingNotification|scheduleInitialMeeting|rescheduleSessionMeeting/);
    expect(integration).not.toMatch(/showSuccessToast|showErrorToast|notification_deliveries/);
  });
});
