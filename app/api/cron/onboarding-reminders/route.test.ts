import { afterEach, describe, expect, it, vi } from "vitest";

const processOnboardingReminderEmails = vi.hoisted(() => vi.fn());
vi.mock("@/features/notifications/onboarding-reminders", () => ({ processOnboardingReminderEmails }));

import * as route from "./route";

describe("onboarding reminder job endpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("does not expose a GET invocation path", () => {
    expect("GET" in route).toBe(false);
  });

  it.each([undefined, "Bearer wrong"])("rejects missing or invalid job authentication", async (authorization) => {
    process.env.CRON_SECRET = "expected-test-secret";
    const request = new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    });
    const response = await route.POST(request);
    expect(response.status).toBe(401);
    expect(processOnboardingReminderEmails).not.toHaveBeenCalled();
  });

  it("fails closed when the job credential is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await route.POST(new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method: "POST",
      headers: { authorization: "Bearer expected-test-secret" },
    }));
    expect(response.status).toBe(401);
    expect(processOnboardingReminderEmails).not.toHaveBeenCalled();
  });

  it("processes only an authenticated POST and returns aggregate counts", async () => {
    process.env.CRON_SECRET = "expected-test-secret";
    processOnboardingReminderEmails.mockResolvedValue({ claimed: 2, sent: 2, failed: 0, uncertain: 0, skipped: 0 });
    const request = new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method: "POST",
      headers: { authorization: "Bearer expected-test-secret" },
    });
    const response = await route.POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, claimed: 2, sent: 2, failed: 0, uncertain: 0, skipped: 0 });
  });
});
