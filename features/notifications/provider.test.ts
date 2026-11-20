import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

import { createResendEmailProvider } from "./provider";

describe("Resend email provider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.NOTIFICATION_FROM_EMAIL;
    delete process.env.NOTIFICATION_REPLY_TO_EMAIL;
  });

  it("passes the durable provider idempotency key through the existing provider wrapper", async () => {
    process.env.RESEND_API_KEY = "mock-only";
    process.env.NOTIFICATION_FROM_EMAIL = "Resonate <notifications@example.test>";
    process.env.NOTIFICATION_REPLY_TO_EMAIL = "support@example.test";
    mocks.send.mockResolvedValue({ data: { id: "provider-id" }, error: null });

    const result = await createResendEmailProvider().send({
      to: ["counselor-a@mailinator.com", "counselor-b@mailinator.com"],
      subject: "Homework Ready for Review",
      text: "Both partners submitted.",
      html: "<p>Both partners submitted.</p>",
      idempotencyKey: "completion-cycle-key",
    });

    expect(result).toEqual({ success: true, providerMessageId: "provider-id" });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      from: "Resonate <notifications@example.test>",
      to: ["counselor-a@mailinator.com", "counselor-b@mailinator.com"],
    }), { idempotencyKey: "completion-cycle-key" });
  });

  it("does not fall back to shared mail credentials when explicit DEV-test configuration is incomplete", async () => {
    process.env.RESEND_API_KEY = "shared-key-must-not-be-used";
    process.env.NOTIFICATION_FROM_EMAIL = "global@example.test";
    process.env.NOTIFICATION_REPLY_TO_EMAIL = "global-reply@example.test";
    const provider = createResendEmailProvider({ apiKey: undefined, from: undefined, replyTo: undefined });

    const result = await provider.send({
      to: ["test@mailinator.com"],
      subject: "Test",
      text: "Test",
      html: "<p>Test</p>",
    });

    expect(result).toMatchObject({ success: false, errorCategory: "configuration" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
