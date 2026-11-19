import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc }) }));

import { getHomeworkCompletionNotificationAlerts, homeworkNotificationStatusMessage } from "./homework-completion-admin";

describe("Homework recipient delivery Admin alerts", () => {
  afterEach(() => vi.clearAllMocks());

  it("loads per-Counselor failures through the protected RPC without contact details", async () => {
    rpc.mockResolvedValue({ data: [{
      delivery_id: "delivery-a", notification_id: "cycle-a", counseling_case_id: "case-a", case_session_id: "session-a",
      status: "failed", status_code: "provider_rejected", completion_cycle: 2, created_at: "2026-11-19T12:00:00Z",
      session_title: "Repair and Restore", session_number: 2, recipient_profile_id: "profile-a", recipient_name: "Counselor A",
    }, {
      delivery_id: "delivery-b", notification_id: "cycle-a", counseling_case_id: "case-a", case_session_id: "session-a",
      status: "uncertain", status_code: "provider_timeout", completion_cycle: 2, created_at: "2026-11-19T12:00:00Z",
      session_title: "Repair and Restore", session_number: 2, recipient_profile_id: "profile-b", recipient_name: "Counselor B",
    }], error: null });

    const result = await getHomeworkCompletionNotificationAlerts(["admin"]);

    expect(rpc).toHaveBeenCalledWith("list_homework_completion_recipient_delivery_alerts", { target_limit: 50 });
    expect(result.alerts.map(({ deliveryId, recipientName, status }) => [deliveryId, recipientName, status])).toEqual([
      ["delivery-a", "Counselor A", "failed"], ["delivery-b", "Counselor B", "uncertain"],
    ]);
    expect(result.alerts[0]).not.toHaveProperty("recipientEmail");
    expect(homeworkNotificationStatusMessage("uncertain", "provider_timeout")).toContain("cannot be manually retried");
  });

  it("does not query recipient alert data for unauthorized workspaces", async () => {
    expect(await getHomeworkCompletionNotificationAlerts(["counselor"])).toEqual({ alerts: [], error: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
