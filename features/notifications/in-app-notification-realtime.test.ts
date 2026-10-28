import { describe, expect, it, vi } from "vitest";
import { subscribeToInAppNotifications } from "./in-app-notification-realtime";

describe("recipient in-app notification Realtime", () => {
  it("subscribes only to inserts for the authenticated recipient and refreshes on their event", () => {
    const handlers: Array<(payload: { new: { recipient_profile_id: string } }) => void> = [];
    const on = vi.fn((_event: string, options: unknown, handler: (payload: { new: { recipient_profile_id: string } }) => void) => {
      expect(options).toMatchObject({ event: "INSERT", schema: "public", table: "in_app_notifications", filter: "recipient_profile_id=eq.partner-a" });
      handlers.push(handler);
      return channel;
    });
    const subscribe = vi.fn(() => channel);
    const channel = { on, subscribe };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn().mockResolvedValue(undefined) };
    const refresh = vi.fn();
    vi.useFakeTimers();
    const dispose = subscribeToInAppNotifications({ profileId: "partner-a", client: client as never, refresh });

    handlers[0]({ new: { recipient_profile_id: "partner-b" } });
    expect(refresh).not.toHaveBeenCalled();
    handlers[0]({ new: { recipient_profile_id: "partner-a" } });
    vi.advanceTimersByTime(150);
    expect(refresh).toHaveBeenCalledOnce();
    dispose();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
    vi.useRealTimers();
  });
});
