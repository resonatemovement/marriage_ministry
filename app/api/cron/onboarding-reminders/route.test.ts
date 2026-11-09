import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingReminderProcessingError } from "@/features/notifications/onboarding-reminder-errors";

const processOnboardingReminderEmails = vi.hoisted(() => vi.fn());
vi.mock("@/features/notifications/onboarding-reminders", () => ({ processOnboardingReminderEmails }));

import * as route from "./route";

describe("onboarding reminder job endpoint", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
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
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = new Request("https://resonate.test/api/cron/onboarding-reminders", {
      method: "GET",
      headers: { authorization: "Bearer expected-test-secret" },
    });
    const response = await route.GET(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, claimed: 2, sent: 2, failed: 0, uncertain: 0, skipped: 0 });
    expect(log).not.toHaveBeenCalled();
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

  it.each([
    ["configuration", "dev_safety_configuration_unavailable"],
    ["supabase", "42501"],
    ["eligibility", "invalid_claim_response"],
    ["delivery_tracking", "finalize_rpc_rejected"],
  ] as const)("logs a safe categorized %s failure while returning a generic 500", async (stage, errorCode) => {
    process.env.CRON_SECRET = "expected-test-secret";
    processOnboardingReminderEmails.mockRejectedValue(new OnboardingReminderProcessingError(stage, errorCode));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await route.GET(new Request("https://resonate.test/api/cron/onboarding-reminders", {
      headers: { authorization: "Bearer expected-test-secret" },
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Onboarding reminders could not be processed." });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[1]).toMatchObject({ stage, errorCode });
    expect(log.mock.calls[0]?.[1]).toMatchObject({
      timestamp: expect.stringMatching(/^202\d-\d\d-\d\dT/),
      runId: expect.stringMatching(/^[\da-f-]{36}$/i),
    });
  });

  it("does not log unexpected exception messages or sensitive values", async () => {
    process.env.CRON_SECRET = "expected-test-secret";
    processOnboardingReminderEmails.mockRejectedValue(new Error("user@example.com bearer secret-token invitation-link"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await route.GET(new Request("https://resonate.test/api/cron/onboarding-reminders", {
      headers: { authorization: "Bearer expected-test-secret" },
    }));

    expect(response.status).toBe(500);
    const serializedLog = JSON.stringify(log.mock.calls);
    expect(serializedLog).toContain('"stage":"unexpected"');
    expect(serializedLog).toContain('"errorCode":"unexpected_application_error"');
    expect(serializedLog).not.toMatch(/user@example\.com|bearer|secret-token|invitation-link/i);
    expect(await response.text()).not.toMatch(/user@example\.com|bearer|secret-token|invitation-link/i);
  });
});
