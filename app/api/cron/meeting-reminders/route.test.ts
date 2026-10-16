import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { processDueMeetingReminders } = vi.hoisted(() => ({ processDueMeetingReminders: vi.fn() }));

vi.mock("@/features/notifications/homework-reminders", () => ({ processDueMeetingReminders }));

import { GET } from "./route";

describe("Meeting reminder Cron route", () => {
  const previousSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    processDueMeetingReminders.mockReset();
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it("rejects a request without the exact bearer credential", async () => {
    const response = await GET(new Request("https://example.test/api/cron/meeting-reminders"));

    expect(response.status).toBe(401);
    expect(processDueMeetingReminders).not.toHaveBeenCalled();
  });

  it("runs the existing reminder processor for an authorized request", async () => {
    processDueMeetingReminders.mockResolvedValue({ scanned: 0, attempted: 0, skipped: 0 });

    const response = await GET(new Request("https://example.test/api/cron/meeting-reminders", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, scanned: 0, attempted: 0, skipped: 0 });
    expect(processDueMeetingReminders).toHaveBeenCalledOnce();
  });
});
