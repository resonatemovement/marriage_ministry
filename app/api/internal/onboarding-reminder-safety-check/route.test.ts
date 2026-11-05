import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const originalEnvironment = { ...process.env };

function setVerifiedDevEnvironment() {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.ONBOARDING_REMINDER_DEV_SAFETY_MODE = "true";
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";
  process.env.VERCEL_GIT_COMMIT_REF = "main";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lctkqjjkhpyootwvttvj.supabase.co";
}

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("temporary onboarding safety runtime check", () => {
  it("rejects missing and invalid CRON_SECRET authentication", async () => {
    setVerifiedDevEnvironment();

    const missing = await POST(new Request("https://example.invalid", { method: "POST" }));
    const invalid = await POST(new Request("https://example.invalid", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    }));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it("returns only dry-run allow/deny checks for fixed synthetic addresses", async () => {
    setVerifiedDevEnvironment();

    const response = await POST(new Request("https://example.invalid", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      safetyModeEnabled: true,
      runtimeIdentityVerified: true,
      mailinatorAllowed: true,
      nonMailinatorDenied: true,
      malformedDenied: true,
      missingSafetyConfigDenied: true,
      mismatchedVercelProjectDenied: true,
      mismatchedSupabaseProjectDenied: true,
    });
  });

  it("fails closed in dry-run results when safety mode is disabled", async () => {
    setVerifiedDevEnvironment();
    process.env.ONBOARDING_REMINDER_DEV_SAFETY_MODE = "false";

    const response = await POST(new Request("https://example.invalid", {
      method: "POST",
      headers: { authorization: "Bearer test-cron-secret" },
    }));

    const result = await response.json();
    expect(result.safetyModeEnabled).toBe(false);
    expect(result.runtimeIdentityVerified).toBe(true);
    expect(result.mailinatorAllowed).toBe(false);
  });
});
