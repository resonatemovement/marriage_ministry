import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleSupabaseClient: () => database }));

import { processOnboardingReminderEmails } from "./onboarding-reminders";
import type { EmailMessage, EmailProvider } from "./types";

const environmentKeys = [
  "ONBOARDING_REMINDER_DEV_SAFETY_MODE",
  "ONBOARDING_REMINDER_DEV_ALLOWED_RECIPIENTS",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_PROJECT_ID",
  "VERCEL_GIT_COMMIT_REF",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;
const previousEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

const claims = [
  { delivery_id: "d1", claim_token: "t1", intake_request_id: "r1", invitation_id: "i1", invited_status_history_id: 11, recipient_email: "synthetic.one@mailinator.com" },
  { delivery_id: "d2", claim_token: "t2", intake_request_id: "r2", invitation_id: "i2", invited_status_history_id: 22, recipient_email: "synthetic.two@mailinator.com" },
];

function configureRpc(nextClaims: unknown) {
  database.rpc.mockImplementation(async (name: string) => {
    if (name === "claim_due_onboarding_reminder_deliveries") return { data: nextClaims, error: null };
    if (name === "authorize_onboarding_reminder_delivery") return { data: true, error: null };
    if (name === "finish_onboarding_reminder_delivery") return { data: true, error: null };
    throw new Error(`Unexpected RPC ${name}`);
  });
}

describe("onboarding reminder processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ONBOARDING_REMINDER_DEV_SAFETY_MODE = "true";
    process.env.ONBOARDING_REMINDER_DEV_ALLOWED_RECIPIENTS = "synthetic.one@mailinator.com,synthetic.two@mailinator.com";
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lctkqjjkhpyootwvttvj.supabase.co";
  });

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = previousEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends no email when there are no due incomplete partners", async () => {
    configureRpc([]);
    const send = vi.fn();
    await expect(processOnboardingReminderEmails({ send })).resolves.toMatchObject({ claimed: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([1, 2])("sends once for each claimed incomplete partner (%i)", async (count) => {
    configureRpc(claims.slice(0, count));
    const messages: EmailMessage[] = [];
    const provider: EmailProvider = { send: async (message) => { messages.push(message); return { success: true, providerMessageId: "provider-id" }; } };
    await expect(processOnboardingReminderEmails(provider)).resolves.toMatchObject({ claimed: count, sent: count, failed: 0, uncertain: 0 });
    expect(messages.map(({ to }) => to)).toEqual(claims.slice(0, count).map(({ recipient_email }) => recipient_email));
    expect(database.rpc.mock.calls.filter(([name]) => name === "authorize_onboarding_reminder_delivery")).toHaveLength(count);
    expect(database.rpc.mock.calls.filter(([name, args]) => name === "finish_onboarding_reminder_delivery" && args.next_state === "sent")).toHaveLength(count);
  });

  it("does not send if the immediate eligibility recheck denies a claim", async () => {
    configureRpc([claims[0]]);
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_due_onboarding_reminder_deliveries") return { data: [claims[0]], error: null };
      if (name === "authorize_onboarding_reminder_delivery") return { data: false, error: null };
      return { data: true, error: null };
    });
    const send = vi.fn();
    await expect(processOnboardingReminderEmails({ send })).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("blocks unlisted recipients and records a retryable rejection without sending", async () => {
    configureRpc([{ ...claims[0], recipient_email: "unlisted@mailinator.com" }]);
    const send = vi.fn().mockResolvedValue({ success: true, providerMessageId: "should-not-send" });
    await expect(processOnboardingReminderEmails({ send })).resolves.toMatchObject({ failed: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(database.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ next_state: "failed", next_error_category: "invalid_recipient" });
  });

  it("retries an explicit provider rejection but withholds retry for an uncertain result", async () => {
    configureRpc([claims[0]]);
    const provider: EmailProvider = { send: async () => ({ success: false, errorCategory: "provider_unavailable", errorMessage: "Rejected", deliveryCertainty: "rejected" }) };
    await expect(processOnboardingReminderEmails(provider)).resolves.toMatchObject({ failed: 1, uncertain: 0 });
    expect(database.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ next_state: "failed" });
  });

  it("records ambiguous provider outcomes as uncertain and never labels them retryable failures", async () => {
    configureRpc([claims[0]]);
    const provider: EmailProvider = { send: async () => ({ success: false, errorCategory: "provider_unavailable", errorMessage: "Network response lost", deliveryCertainty: "unknown" }) };
    await expect(processOnboardingReminderEmails(provider)).resolves.toMatchObject({ failed: 0, uncertain: 1 });
    expect(database.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ next_state: "uncertain" });
  });

  it("fails closed before claiming when DEV identity or the synthetic-recipient allowlist is missing", async () => {
    delete process.env.ONBOARDING_REMINDER_DEV_ALLOWED_RECIPIENTS;
    await expect(processOnboardingReminderEmails()).rejects.toMatchObject({
      stage: "configuration",
      errorCode: "dev_safety_configuration_unavailable",
    });
    expect(database.rpc).not.toHaveBeenCalled();
  });

  it("categorizes a claim RPC error without retaining its message", async () => {
    database.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "contains-private@example.com and token" } });
    await expect(processOnboardingReminderEmails({ send: vi.fn() })).rejects.toMatchObject({
      stage: "supabase",
      errorCode: "42501",
      message: "Onboarding reminder processing failed.",
    });
  });

  it("replaces an unsafe database error code with a safe category", async () => {
    database.rpc.mockResolvedValue({ data: null, error: { code: "private@example.com", message: "secret" } });
    await expect(processOnboardingReminderEmails({ send: vi.fn() })).rejects.toMatchObject({
      stage: "supabase",
      errorCode: "claim_rpc_failed",
    });
  });

  it("categorizes an invalid claim payload as an eligibility failure", async () => {
    configureRpc({ email: "private@example.com" });
    await expect(processOnboardingReminderEmails({ send: vi.fn() })).rejects.toMatchObject({
      stage: "eligibility",
      errorCode: "invalid_claim_response",
    });
  });

  it("categorizes an eligibility recheck RPC error without retaining its message", async () => {
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_due_onboarding_reminder_deliveries") return { data: [claims[0]], error: null };
      return { data: null, error: { code: "PGRST301", message: "recipient and token must not be logged" } };
    });
    await expect(processOnboardingReminderEmails({ send: vi.fn() })).rejects.toMatchObject({
      stage: "eligibility",
      errorCode: "PGRST301",
      message: "Onboarding reminder processing failed.",
    });
  });

  it("categorizes a finalization RPC error as a delivery-tracking failure", async () => {
    configureRpc([claims[0]]);
    database.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_due_onboarding_reminder_deliveries") return { data: [claims[0]], error: null };
      if (name === "authorize_onboarding_reminder_delivery") return { data: true, error: null };
      return { data: null, error: { code: "XX000", message: "private@example.com token" } };
    });
    const provider: EmailProvider = { send: async () => ({ success: true, providerMessageId: "provider-id" }) };
    await expect(processOnboardingReminderEmails(provider)).rejects.toMatchObject({
      stage: "delivery_tracking",
      errorCode: "XX000",
      message: "Onboarding reminder processing failed.",
    });
  });
});
