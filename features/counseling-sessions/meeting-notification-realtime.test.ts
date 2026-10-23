import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { subscribeToMeetingNotificationUpdates } from "./meeting-notification-realtime";

type SignalRow = Database["public"]["Tables"]["meeting_notification_update_signals"]["Row"];
type SignalPayload = RealtimePostgresInsertPayload<SignalRow> | RealtimePostgresUpdatePayload<SignalRow>;
type EventCallback = (payload: SignalPayload) => void;
type StatusCallback = (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") => void;

function signalRow(meetingId: string, revision = 1): SignalRow {
  return { meeting_id: meetingId, counseling_case_id: "case-id", revision };
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
    filters,
    event: (event: "INSERT" | "UPDATE", meetingId: string) => callbacks.get(event)?.({
      schema: "public",
      table: "meeting_notification_update_signals",
      commit_timestamp: "2026-10-23T12:00:00Z",
      eventType: event,
      new: signalRow(meetingId),
      old: event === "UPDATE" ? { meeting_id: meetingId } : {},
      errors: [],
    } as SignalPayload),
    status: (status: Parameters<StatusCallback>[0]) => statusCallback?.(status),
  };
}

describe("Meeting notification Realtime invalidation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uses one channel with exact Meeting-scoped INSERT and UPDATE subscriptions", () => {
    const test = harness();
    subscribeToMeetingNotificationUpdates({ meetingId: "meeting-a", client: test.client, refresh: vi.fn() });

    expect(test.client.channel).toHaveBeenCalledOnce();
    expect(test.client.channel).toHaveBeenCalledWith("meeting-notifications:meeting-a");
    expect(test.filters).toEqual([
      { event: "INSERT", schema: "public", table: "meeting_notification_update_signals", filter: "meeting_id=eq.meeting-a" },
      { event: "UPDATE", schema: "public", table: "meeting_notification_update_signals", filter: "meeting_id=eq.meeting-a" },
    ]);
  });

  it.each(["INSERT", "UPDATE"] as const)("refreshes for a matching %s", (event) => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToMeetingNotificationUpdates({ meetingId: "meeting-a", client: test.client, refresh });

    test.event(event, "meeting-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("rejects unrelated payloads and coalesces bursts", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToMeetingNotificationUpdates({ meetingId: "meeting-a", client: test.client, refresh });

    test.event("UPDATE", "meeting-other");
    test.event("INSERT", "meeting-a");
    test.event("UPDATE", "meeting-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after recovery without refreshing on the initial subscription", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToMeetingNotificationUpdates({ meetingId: "meeting-a", client: test.client, refresh });

    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();

    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes the channel and cancels pending work on cleanup", () => {
    const test = harness();
    const refresh = vi.fn();
    const cleanup = subscribeToMeetingNotificationUpdates({ meetingId: "meeting-a", client: test.client, refresh });
    test.event("UPDATE", "meeting-a");

    cleanup();
    test.event("INSERT", "meeting-a");
    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();

    expect(test.client.removeChannel).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("mounts only beside the authorized staff delivery view without mutation or toast side effects", () => {
    const caseView = readFileSync(new URL("./couple-detail-page.tsx", import.meta.url), "utf8");
    const coupleView = readFileSync(new URL("../couple-workspace/workspace.tsx", import.meta.url), "utf8");
    const integration = readFileSync(new URL("./meeting-notification-realtime.tsx", import.meta.url), "utf8");
    const query = readFileSync(new URL("../notifications/meeting-notifications.ts", import.meta.url), "utf8");

    expect(caseView).toContain("<MeetingNotificationRealtime meetingId={card.state.meeting.id}");
    expect(coupleView).not.toContain("MeetingNotificationRealtime");
    expect(integration).toContain("startFeatureRealtimeSubscription");
    expect(integration).toContain("startAuthReadyRealtimeSubscription");
    expect(integration).not.toMatch(/dispatchMeetingNotifications|resendMeetingNotification|deliverMeetingReminder/);
    expect(integration).not.toMatch(/showSuccessToast|showErrorToast|notification_deliveries/);
    expect(query.slice(query.indexOf("export async function getMeetingNotificationRows"))).not.toContain("recipient_email");
  });
});
