import { afterEach, describe, expect, it, vi } from "vitest";

const processOnboardingReminderEmails = vi.hoisted(() => vi.fn());
vi.mock("@/features/notifications/onboarding-reminders", () => ({ processOnboardingReminderEmails }));

import * as route from "./route";

describe("onboarding reminder job endpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it.each(["GET", "POST"] as const)("rejects missing or invalid %s authentication", async (method) => {
    process.env.CRON_SECRET = "expected-test-secret";
    for (const authorization of [undefined, "Bearer wrong"]) {
      const request = new Request("https://resonate.test/api/cron/onboarding-reminders", {
        method,
        headers: authorization ? { authorization } : {},
      });
      const response = await route[method](request);
      expect(response.status).toBe(401);
      expect(processOnboardingReminderEmails).not.toHaveBeenCalled();
    }
  });

  it.each(["GET", "POST"] as const)("fails closed when the %s job credential is not configured", async (method) => {
    delete process.env.CRON_SECRET;
    const response = await route[method](new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method,
      headers: { authorization: "Bearer expected-test-secret" },
    }));
    expect(response.status).toBe(401);
    expect(processOnboardingReminderEmails).not.toHaveBeenCalled();
  });

  it("processes an authenticated scheduled GET and returns aggregate counts", async () => {
    process.env.CRON_SECRET = "expected-test-secret";
    processOnboardingReminderEmails.mockResolvedValue({ claimed: 2, sent: 2, failed: 0, uncertain: 0, skipped: 0 });
    const request = new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method: "GET",
      headers: { authorization: "Bearer expected-test-secret" },
    });
    const response = await route.GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, claimed: 2, sent: 2, failed: 0, uncertain: 0, skipped: 0 });
  });

  it("preserves the authenticated POST verification path", async () => {
    process.env.CRON_SECRET = "expected-test-secret";
    processOnboardingReminderEmails.mockResolvedValue({ claimed: 0, sent: 0, failed: 0, uncertain: 0, skipped: 0 });
    const response = await route.POST(new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method: "POST",
      headers: { authorization: "Bearer expected-test-secret" },
    }));
    expect(response.status).toBe(200);
    expect(processOnboardingReminderEmails).toHaveBeenCalledOnce();
  });
});
