import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { subscribeToCaseLifecycle } from "./case-lifecycle-realtime";

type CaseSessionRow = Database["public"]["Tables"]["case_sessions"]["Row"];
type CounselingCaseRow = Database["public"]["Tables"]["counseling_cases"]["Row"];
type LifecyclePayload =
  | RealtimePostgresInsertPayload<CaseSessionRow>
  | RealtimePostgresUpdatePayload<CaseSessionRow>
  | RealtimePostgresUpdatePayload<CounselingCaseRow>;
type EventCallback = (payload: LifecyclePayload) => void;
type StatusCallback = (status: "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") => void;

function sessionRow(caseId: string): CaseSessionRow {
  return {
    id: "case-session-id",
    counseling_case_id: caseId,
    session_id: "session-id",
    actual_sequence: 2,
    template_sequence_number: 2,
    title: "Communication",
    status: "active",
    homework_assignment_revision_id: "revision-id",
    material_released_at: "2026-10-20T12:00:00Z",
    homework_released_at: "2026-10-20T12:00:00Z",
    activated_at: "2026-10-20T12:00:00Z",
    activated_by: "counselor-id",
    completed_at: null,
    completed_by: null,
    created_at: "2026-10-20T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
    is_final: false,
  };
}

function caseRow(caseId: string): CounselingCaseRow {
  return {
    id: caseId,
    campus_id: "campus-id",
    couple_group_id: "couple-id",
    status: "active",
    requested_at: "2026-10-20T12:00:00Z",
    closed_at: null,
    created_by: "admin-id",
    created_at: "2026-10-20T12:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
  };
}

function harness() {
  const callbacks = new Map<string, EventCallback>();
  let statusCallback: StatusCallback | null = null;
  const filters: Array<Record<string, string>> = [];
  const channel = {
    on: vi.fn((_type: string, filter: Record<string, string>, callback: EventCallback) => {
      filters.push(filter);
      callbacks.set(`${filter.table}:${filter.event}`, callback);
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
    sessionEvent: (event: "INSERT" | "UPDATE", caseId: string) => callbacks.get(`case_sessions:${event}`)?.({
      schema: "public",
      table: "case_sessions",
      commit_timestamp: "2026-10-20T12:00:00Z",
      eventType: event,
      new: sessionRow(caseId),
      old: event === "UPDATE" ? { id: "case-session-id" } : {},
      errors: [],
    } as LifecyclePayload),
    caseEvent: (caseId: string) => callbacks.get("counseling_cases:UPDATE")?.({
      schema: "public",
      table: "counseling_cases",
      commit_timestamp: "2026-10-20T12:00:00Z",
      eventType: "UPDATE",
      new: caseRow(caseId),
      old: { id: caseId },
      errors: [],
    } as LifecyclePayload),
    status: (status: Parameters<StatusCallback>[0]) => statusCallback?.(status),
  };
}

describe("Case lifecycle Realtime invalidation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uses one channel with exact case-scoped Session and Case subscriptions", () => {
    const test = harness();
    subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh: vi.fn() });

    expect(test.client.channel).toHaveBeenCalledOnce();
    expect(test.client.channel).toHaveBeenCalledWith("case-lifecycle:case-a");
    expect(test.filters).toEqual([
      { event: "INSERT", schema: "public", table: "case_sessions", filter: "counseling_case_id=eq.case-a" },
      { event: "UPDATE", schema: "public", table: "case_sessions", filter: "counseling_case_id=eq.case-a" },
      { event: "UPDATE", schema: "public", table: "counseling_cases", filter: "id=eq.case-a" },
    ]);
  });

  it.each(["INSERT", "UPDATE"] as const)("refreshes for a matching Session %s", (event) => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh });

    test.sessionEvent(event, "case-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes for a matching Case update", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh });

    test.caseEvent("case-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("ignores other Cases and coalesces a lifecycle transaction burst", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh });

    test.sessionEvent("UPDATE", "case-other");
    test.caseEvent("case-other");
    test.sessionEvent("UPDATE", "case-a");
    test.sessionEvent("INSERT", "case-a");
    test.caseEvent("case-a");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after reconnect without refreshing on initial subscribe", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh });

    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();

    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after recovering from an initial channel error", () => {
    const test = harness();
    const refresh = vi.fn();
    subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh });

    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes the channel and pending timer on unmount", () => {
    const test = harness();
    const refresh = vi.fn();
    const cleanup = subscribeToCaseLifecycle({ caseId: "case-a", client: test.client, refresh });
    test.sessionEvent("UPDATE", "case-a");

    cleanup();
    test.caseEvent("case-a");
    test.status("CHANNEL_ERROR");
    test.status("SUBSCRIBED");
    vi.runAllTimers();

    expect(test.client.removeChannel).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("replaces a Case subscription without retaining its timer or channel", () => {
    const first = harness();
    const second = harness();
    const refresh = vi.fn();
    const cleanup = subscribeToCaseLifecycle({ caseId: "case-a", client: first.client, refresh });
    first.sessionEvent("UPDATE", "case-a");
    cleanup();
    subscribeToCaseLifecycle({ caseId: "case-b", client: second.client, refresh });
    second.caseEvent("case-b");
    vi.runAllTimers();

    expect(first.client.removeChannel).toHaveBeenCalledOnce();
    expect(second.client.channel).toHaveBeenCalledWith("case-lifecycle:case-b");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("mounts only from authorized server data and has no lifecycle, email, or toast side effects", () => {
    const counselor = readFileSync(new URL("./couple-detail-page.tsx", import.meta.url), "utf8");
    const couple = readFileSync(new URL("../couple-workspace/workspace.tsx", import.meta.url), "utf8");
    const sessionView = readFileSync(new URL("../couple-workspace/session-view.tsx", import.meta.url), "utf8");
    const integration = readFileSync(new URL("./case-lifecycle-realtime.tsx", import.meta.url), "utf8");

    expect(counselor).toContain("<CaseLifecycleRealtime caseId={card.caseId}");
    expect(couple).toContain("<CaseLifecycleRealtime caseId={data.caseId}");
    expect(couple.indexOf("if (!data) return")).toBeLessThan(couple.indexOf("<CaseLifecycleRealtime caseId={data.caseId}"));
    expect(sessionView).toContain("<CaseLifecycleRealtime caseId={session.caseId}");
    expect(integration).not.toMatch(/completeCaseSession|completeCounselingProgram|closeCounselingCase|dispatchMeetingNotifications|sendEmail/);
    expect(integration).not.toMatch(/showSuccessToast|showErrorToast|notification_deliveries/);
  });
});
