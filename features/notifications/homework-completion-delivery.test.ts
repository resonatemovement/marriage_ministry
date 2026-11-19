import { afterEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ client: { rpc: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleSupabaseClient: () => mockState.client }));
vi.mock("./provider", () => ({ createResendEmailProvider: vi.fn() }));

import { processHomeworkCompletionNotifications } from "./homework-completion-delivery";
import type { EmailMessage, EmailProvider } from "./types";

const notificationId = "11111111-1111-4111-8111-111111111111";
const caseId = "33333333-3333-4333-8333-333333333333";
const deliveries = [
  { notification_id: notificationId, delivery_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", claim_token: "lease-a", manual_recovery: false },
  { notification_id: notificationId, delivery_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", claim_token: "lease-b", manual_recovery: false },
];
const partners = [
  { profile_id: "partner-a", first_name: "Alex", last_name: "Johnson", gender: "male" },
  { profile_id: "partner-b", first_name: "Taylor", last_name: "Smith", gender: "female" },
];

function providerPayload(claim: typeof deliveries[number], attemptId: string, recipient: string) {
  return {
    to: [recipient], from: "notifications@example.test", replyTo: "help@example.test",
    subject: "Homework Ready for Review — Alex & Taylor", html: "<p>Session Homework review</p>", text: "Both partners submitted.",
    tags: [
      { name: "notification_id", value: notificationId },
      { name: "notification_delivery_id", value: claim.delivery_id },
      { name: "notification_attempt_id", value: attemptId },
      { name: "notification_type", value: "homework_completion" },
      { name: "completion_cycle", value: "1" },
    ],
  };
}

function configureMocks(options: { claims?: typeof deliveries; emails?: Record<string, string>; authorize?: (deliveryId: string) => unknown; finish?: (deliveryId: string, outcome: string) => string } = {}) {
  const claims = options.claims ?? deliveries;
  mockState.client.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    const claim = claims.find(({ delivery_id }) => delivery_id === args.target_delivery_id)
      ?? claims.find(({ claim_token }) => claim_token === args.target_claim_token);
    if (name === "claim_due_homework_completion_recipient_deliveries") return { data: claims, error: null };
    if (name === "get_homework_completion_recipient_delivery_context") return { data: {
      notification_id: notificationId, delivery_id: claim?.delivery_id, case_id: caseId,
      case_session_id: "44444444-4444-4444-8444-444444444444", completion_cycle: 1,
      session_title: "Repair and Restore", session_number: 2, recipient_profile_id: claim?.delivery_id,
      recipient_email: options.emails?.[claim?.delivery_id ?? ""] ?? (claim === claims[0] ? "counselor-a@mailinator.com" : "counselor-b@mailinator.com"),
      partners,
    }, error: null };
    if (name === "get_homework_completion_notification_attempt_id") return { data: claim?.delivery_id === deliveries[1].delivery_id ? "attempt-b" : "attempt-a", error: null };
    if (name === "prepare_homework_completion_recipient_payload") {
      const recipient = options.emails?.[claim?.delivery_id ?? ""] ?? (claim === claims[0] ? "counselor-a@mailinator.com" : "counselor-b@mailinator.com");
      const payload = providerPayload(claim ?? claims[0]!, claim?.delivery_id === deliveries[1].delivery_id ? "attempt-b" : "attempt-a", recipient);
      return { data: { idempotencyKey: `stable-${claim?.delivery_id}`, payload }, error: null };
    }
    if (name === "authorize_homework_completion_recipient_delivery") {
      if (options.authorize?.(claim?.delivery_id ?? "") === null) return { data: null, error: null };
      const recipient = options.emails?.[claim?.delivery_id ?? ""] ?? (claim === claims[0] ? "counselor-a@mailinator.com" : "counselor-b@mailinator.com");
      const payload = providerPayload(claim ?? claims[0]!, claim?.delivery_id === deliveries[1].delivery_id ? "attempt-b" : "attempt-a", recipient);
      return { data: { idempotencyKey: `stable-${claim?.delivery_id}`, providerPayload: payload, idempotencyCutoffAt: new Date(Date.now() + 60_000).toISOString() }, error: null };
    }
    if (name === "finish_homework_completion_recipient_attempt") return { data: options.finish?.(claim?.delivery_id ?? "", String(args.provider_outcome)) ?? "sent", error: null };
    return { data: null, error: null };
  });
}

function allowDevDelivery() {
  process.env.ONBOARDING_REMINDER_DEV_SAFETY_MODE = "true";
  process.env.ONBOARDING_REMINDER_DEV_ALLOWED_RECIPIENTS = "counselor-a@mailinator.com,counselor-b@mailinator.com";
  process.env.VERCEL = "1";
  process.env.VERCEL_ENV = "production";
  process.env.VERCEL_PROJECT_ID = "prj_J5QbuVHBVRyQeq78Qd6G9HmJFbVt";
  process.env.VERCEL_GIT_COMMIT_REF = "main";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://lctkqjjkhpyootwvttvj.supabase.co";
  process.env.RESEND_API_KEY = "mock-only";
  process.env.NOTIFICATION_FROM_EMAIL = "notifications@example.test";
  process.env.NOTIFICATION_REPLY_TO_EMAIL = "help@example.test";
}

describe("Homework completion recipient delivery", () => {
  afterEach(() => {
    vi.clearAllMocks();
    for (const key of ["ONBOARDING_REMINDER_DEV_SAFETY_MODE", "ONBOARDING_REMINDER_DEV_ALLOWED_RECIPIENTS", "VERCEL", "VERCEL_ENV", "VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "NEXT_PUBLIC_SUPABASE_URL", "RESEND_API_KEY", "NOTIFICATION_FROM_EMAIL", "NOTIFICATION_REPLY_TO_EMAIL"]) delete process.env[key];
  });

  it("sends a separate one-recipient message for each eligible Counselor in one completion cycle", async () => {
    configureMocks(); allowDevDelivery();
    const sent: EmailMessage[] = [];
    const provider: EmailProvider = { send: async (message) => { sent.push(message); return { success: true, providerMessageId: `resend-${sent.length}` }; } };
    const result = await processHomeworkCompletionNotifications(provider);

    expect(result).toMatchObject({ claimed: 2, accepted: 2 });
    expect(sent).toHaveLength(2);
    expect(sent.map(({ to }) => to)).toEqual([["counselor-a@mailinator.com"], ["counselor-b@mailinator.com"]]);
    expect(sent[0]?.idempotencyKey).not.toBe(sent[1]?.idempotencyKey);
    expect(sent[0]?.tags).toContainEqual({ name: "notification_delivery_id", value: deliveries[0]!.delivery_id });
    expect(sent[1]?.tags).toContainEqual({ name: "notification_delivery_id", value: deliveries[1]!.delivery_id });
    expect(mockState.client.rpc.mock.calls.map(([name]) => name)).not.toContain("claim_due_homework_completion_notifications");
    expect(mockState.client.rpc).toHaveBeenCalledWith("finish_homework_completion_recipient_attempt", expect.objectContaining({
      target_notification_id: notificationId, target_delivery_id: deliveries[1]!.delivery_id, provider_outcome: "accepted",
    }));
  });

  it("supports one eligible Counselor and no eligible deliveries", async () => {
    configureMocks({ claims: [deliveries[0]!] }); allowDevDelivery();
    const oneRecipientProvider: EmailProvider = { send: vi.fn(async () => ({ success: true as const, providerMessageId: "one" })) };
    expect((await processHomeworkCompletionNotifications(oneRecipientProvider)).accepted).toBe(1);
    expect(oneRecipientProvider.send).toHaveBeenCalledOnce();

    configureMocks({ claims: [] }); allowDevDelivery();
    const noRecipientProvider: EmailProvider = { send: vi.fn() };
    expect((await processHomeworkCompletionNotifications(noRecipientProvider)).claimed).toBe(0);
    expect(noRecipientProvider.send).not.toHaveBeenCalled();
  });

  it("retries only the failed recipient when the other Counselor succeeds", async () => {
    configureMocks({ finish: (deliveryId, outcome) => deliveryId === deliveries[0]!.delivery_id ? "sent" : outcome === "rejected_retryable" ? "pending" : "sent" });
    allowDevDelivery();
    const sent: EmailMessage[] = [];
    const provider: EmailProvider = { send: async (message) => {
      sent.push(message);
      return message.to[0] === "counselor-a@mailinator.com"
        ? { success: true, providerMessageId: "success-a" }
        : { success: false, errorCategory: "provider_unavailable", errorMessage: "temporary", deliveryCertainty: "rejected" };
    } };
    const result = await processHomeworkCompletionNotifications(provider);

    expect(result.accepted).toBe(1);
    expect(result.retryScheduled).toBe(1);
    const finishCalls = mockState.client.rpc.mock.calls.filter(([name]) => name === "finish_homework_completion_recipient_attempt");
    expect(finishCalls.map(([, args]) => [args.target_delivery_id, args.provider_outcome])).toEqual([
      [deliveries[0]!.delivery_id, "accepted"], [deliveries[1]!.delivery_id, "rejected_retryable"],
    ]);
  });

  it("targets a manual recovery to the claimed recipient delivery only", async () => {
    const manualClaim = { ...deliveries[1]!, manual_recovery: true };
    configureMocks({ claims: [manualClaim] }); allowDevDelivery();
    const provider: EmailProvider = { send: vi.fn(async () => ({ success: true as const, providerMessageId: "manual" })) };
    const result = await processHomeworkCompletionNotifications(provider);
    expect(result.accepted).toBe(1);
    expect(mockState.client.rpc).toHaveBeenCalledWith("prepare_homework_completion_recipient_payload", expect.objectContaining({ target_delivery_id: manualClaim.delivery_id }));
    expect(mockState.client.rpc).toHaveBeenCalledWith("finish_homework_completion_recipient_attempt", expect.objectContaining({ target_delivery_id: manualClaim.delivery_id }));
  });

  it("does not send when cancellation or reassignment invalidates the final authorization", async () => {
    configureMocks({ authorize: () => null }); allowDevDelivery();
    const provider: EmailProvider = { send: vi.fn() };
    const result = await processHomeworkCompletionNotifications(provider);
    expect(result.skipped).toBe(2);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("fails closed when the DEV recipient allowlist is missing", async () => {
    configureMocks();
    const provider: EmailProvider = { send: vi.fn() };
    await expect(processHomeworkCompletionNotifications(provider)).rejects.toThrow("DEV safety is not configured");
    expect(mockState.client.rpc).not.toHaveBeenCalled();
  });

  it("does not claim or send from a Preview deployment even with delivery secrets configured", async () => {
    configureMocks(); allowDevDelivery();
    process.env.VERCEL_ENV = "preview";
    const provider: EmailProvider = { send: vi.fn() };

    await expect(processHomeworkCompletionNotifications(provider)).rejects.toThrow("DEV safety is not configured");

    expect(mockState.client.rpc).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });
});
