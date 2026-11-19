import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { webhooks = { verify: mocks.verify }; } }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleSupabaseClient: () => ({ rpc: mocks.rpc }) }));

import { POST } from "./route";

const notificationId = "11111111-1111-4111-8111-111111111111";
const attemptId = "22222222-2222-4222-8222-222222222222";
const deliveryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tags = [
  { name: "notification_id", value: notificationId },
  { name: "notification_delivery_id", value: deliveryId },
  { name: "notification_attempt_id", value: attemptId },
  { name: "notification_type", value: "homework_completion" },
];
const request = () => new Request("https://resonate.test/api/webhooks/resend", {
  method: "POST", body: "signed-payload",
  headers: { "svix-id": "provider-event-id", "svix-timestamp": "timestamp", "svix-signature": "signature" },
});

describe("Resend Homework completion webhook reconciliation", () => {
  afterEach(() => { vi.clearAllMocks(); delete process.env.RESEND_WEBHOOK_SECRET; });

  it("correlates a signed event to the exact recipient delivery and attempt", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.verify.mockReturnValue({ type: "email.delivered", created_at: "2026-11-19T12:00:00.000Z", data: { email_id: "provider-message-id", to: ["counselor@mailinator.com"], tags } });
    mocks.rpc.mockResolvedValueOnce({ data: "verified", error: null }).mockResolvedValueOnce({ data: "delivered", error: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "verify_homework_completion_notification_webhook", {
      target_notification_id: notificationId, target_attempt_id: attemptId, target_delivery_id: deliveryId,
      target_provider_message_id: "provider-message-id", target_provider_recipients: ["counselor@mailinator.com"],
    });
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_homework_completion_notification_attempt", expect.objectContaining({
      target_attempt_id: attemptId, provider_outcome: "delivered", target_provider_message_id: "provider-message-id", target_provider_event_id: "provider-event-id",
    }));
  });

  it("records a provider rejection without treating it as a bounce", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.verify.mockReturnValue({ type: "email.failed", created_at: "2026-11-19T12:00:00.000Z", data: { email_id: "provider-message-id", to: ["counselor@mailinator.com"], failed: { reason: "provider rejected" }, tags } });
    mocks.rpc.mockResolvedValueOnce({ data: "verified", error: null }).mockResolvedValueOnce({ data: "failed", error: null });

    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_homework_completion_notification_attempt", expect.objectContaining({
      target_attempt_id: attemptId, provider_outcome: "rejected_permanent", target_error_category: "resend_delivery_failed",
    }));
  });

  it("forwards duplicate signed event replays to the idempotent database reconciler", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.verify.mockReturnValue({ type: "email.delivered", created_at: "2026-11-19T12:00:00.000Z", data: { email_id: "provider-message-id", to: ["counselor@mailinator.com"], tags } });
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "verify_homework_completion_notification_webhook" ? "verified" : "delivered", error: null }));

    await POST(request());
    await POST(request());

    expect(mocks.rpc.mock.calls.filter(([name]) => name === "verify_homework_completion_notification_webhook")).toHaveLength(2);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "reconcile_homework_completion_notification_attempt")).toHaveLength(2);
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_homework_completion_notification_attempt", expect.objectContaining({ target_attempt_id: attemptId, target_provider_event_id: "provider-event-id" }));
  });

  it("does not reconcile an event with a recipient that differs from its frozen delivery", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.verify.mockReturnValue({ type: "email.delivered", created_at: "2026-11-19T12:00:00.000Z", data: { email_id: "provider-message-id", to: ["unexpected@mailinator.com"], tags } });
    mocks.rpc.mockResolvedValueOnce({ data: "unmatched", error: null });

    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("verify_homework_completion_notification_webhook", expect.objectContaining({ target_delivery_id: deliveryId, target_provider_recipients: ["unexpected@mailinator.com"] }));
  });

  it("ignores old cycle-scoped or malformed events without a recipient delivery tag", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.verify.mockReturnValue({ type: "email.delivered", created_at: "2026-11-19T12:00:00.000Z", data: { email_id: "provider-message-id", to: ["counselor@mailinator.com"], tags: tags.filter(({ name }) => name !== "notification_delivery_id") } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("ignores delayed events and rejects multi-recipient provider events", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
    mocks.verify.mockReturnValueOnce({ type: "email.delivery_delayed", data: { tags } });
    expect((await POST(request())).status).toBe(200);
    mocks.verify.mockReturnValueOnce({ type: "email.delivered", data: { email_id: "provider-message-id", to: ["a@mailinator.com", "b@mailinator.com"], tags } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
