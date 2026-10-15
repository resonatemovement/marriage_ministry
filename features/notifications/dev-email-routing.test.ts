import { describe, expect, it } from "vitest";

import { resolveEmailRecipient, RESEND_DEV_TEST_RECIPIENT } from "./dev-email-routing";

const intended = "partner@example.test";
const devEnvironment = { nodeEnv: "development", testMode: "true", supabaseUrl: "https://lctkqjjkhpyootwvttvj.supabase.co" };

describe("DEV email routing guard", () => {
  it("routes only opted-in local development delivery on the linked DEV Supabase project to Resend's fixed test recipient", () => {
    expect(resolveEmailRecipient(intended, devEnvironment)).toEqual({ email: RESEND_DEV_TEST_RECIPIENT, isTestSink: true });
  });

  it.each([
    { ...devEnvironment, nodeEnv: "production" },
    { ...devEnvironment, testMode: "false" },
    { ...devEnvironment, supabaseUrl: "https://production-ref.supabase.co" },
    { ...devEnvironment, supabaseUrl: "not-a-url" },
  ])("leaves the intended recipient unchanged outside the exact DEV-only opt-in", (environment) => {
    expect(resolveEmailRecipient(intended, environment)).toEqual({ email: intended, isTestSink: false });
  });
});
