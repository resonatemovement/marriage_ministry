import { afterEach, describe, expect, it, vi } from "vitest";

const processWorker = vi.hoisted(() => vi.fn());
vi.mock("@/features/notifications/homework-completion-delivery", () => ({ processHomeworkCompletionNotifications: processWorker }));

import * as route from "./route";

describe("Homework completion notification cron route", () => {
  afterEach(() => { vi.clearAllMocks(); delete process.env.CRON_SECRET; });

  it("requires the configured cron bearer credential", async () => {
    process.env.CRON_SECRET = "test-secret";
    const response = await route.GET(new Request("https://resonate.test/api/cron/homework-completion-notifications"));
    expect(response.status).toBe(401);
    expect(processWorker).not.toHaveBeenCalled();
  });

  it("runs the worker only for an authenticated cron call", async () => {
    process.env.CRON_SECRET = "test-secret";
    processWorker.mockResolvedValue({ claimed: 1, accepted: 1, delivered: 0, retryScheduled: 0, failed: 0, uncertain: 0, skipped: 0, blockedByDevAllowlist: 0 });
    const response = await route.GET(new Request("https://resonate.test/api/cron/homework-completion-notifications", { headers: { authorization: "Bearer test-secret" } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, claimed: 1, accepted: 1 });
    expect(processWorker).toHaveBeenCalledOnce();
  });

  it("returns generic failure output without exposing worker errors", async () => {
    process.env.CRON_SECRET = "test-secret";
    processWorker.mockRejectedValue(new Error("user@example.com confidential token"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await route.GET(new Request("https://resonate.test/api/cron/homework-completion-notifications", { headers: { authorization: "Bearer test-secret" } }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/user@example|confidential token/i);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/user@example|confidential token/i);
  });
});
