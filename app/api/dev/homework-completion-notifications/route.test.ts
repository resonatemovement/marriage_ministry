import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  authorized: vi.fn(),
  process: vi.fn(),
  identity: vi.fn(),
}));

vi.mock("@/features/notifications/homework-completion-dev-test", () => ({
  getHomeworkCompletionDevTestConfig: mocks.getConfig,
  isHomeworkCompletionDevTestAuthorized: mocks.authorized,
}));
vi.mock("@/features/notifications/homework-completion-delivery", () => ({
  processHomeworkCompletionDevTestNotification: mocks.process,
}));
vi.mock("@/lib/auth/session", () => ({ getAuthenticatedIdentity: mocks.identity }));

import { POST } from "./route";

const config = {
  executionMode: "preview" as const,
  notificationId: "11111111-1111-4111-8111-111111111111",
  caseSessionId: "22222222-2222-4222-8222-222222222222",
  coupleGroupId: "33333333-3333-4333-8333-333333333333",
  allowedRecipients: ["first-counselor@mailinator.com", "second-counselor@mailinator.com"] as [string, string],
};

const request = (body: unknown) => new Request("https://dev.invalid/api/dev/homework-completion-notifications", {
  method: "POST",
  headers: { authorization: "Bearer test-credential", "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("manual DEV Homework notification endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue(config);
    mocks.authorized.mockReturnValue(true);
    mocks.identity.mockResolvedValue({ id: "admin-id", roles: ["admin"], accountStage: "active" });
    mocks.process.mockResolvedValue({ claimed: 2, accepted: 2 });
  });

  it("is unavailable when the exact DEV test configuration is not enabled", async () => {
    mocks.getConfig.mockReturnValue(null);
    const response = await POST(request({ notificationId: config.notificationId }));
    expect(response.status).toBe(404);
    expect(mocks.identity).not.toHaveBeenCalled();
    expect(mocks.authorized).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("requires the protected credential before processing", async () => {
    mocks.authorized.mockReturnValue(false);
    const response = await POST(request({ notificationId: config.notificationId }));
    expect(response.status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("requires an authenticated Admin or Super Admin session", async () => {
    mocks.identity.mockResolvedValue(null);
    expect((await POST(request({ notificationId: config.notificationId }))).status).toBe(401);
    mocks.identity.mockResolvedValue({ id: "couple-id", roles: ["couple"], accountStage: "active" });
    expect((await POST(request({ notificationId: config.notificationId }))).status).toBe(403);
    expect(mocks.authorized).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects a different notification or extra caller-supplied scope before claiming", async () => {
    for (const body of [
      { notificationId: "44444444-4444-4444-8444-444444444444" },
      { notificationId: config.notificationId, coupleGroupId: "attacker-controlled" },
      {},
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("invokes only the server-configured target and returns aggregate results", async () => {
    const response = await POST(request({ notificationId: config.notificationId }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledOnce();
    expect(mocks.process).toHaveBeenCalledWith(config);
    expect(await response.json()).toMatchObject({ ok: true, claimed: 2, accepted: 2 });
  });

  it("allows local mode only when the request host is loopback", async () => {
    mocks.getConfig.mockReturnValue({ ...config, executionMode: "local" });
    const remote = await POST(new Request("https://example.test/api/dev/homework-completion-notifications", {
      method: "POST",
      headers: { authorization: "Bearer test-credential", "content-type": "application/json" },
      body: JSON.stringify({ notificationId: config.notificationId }),
    }));
    expect(remote.status).toBe(404);
    expect(mocks.process).not.toHaveBeenCalled();

    const localhostRequest = new Request("http://localhost:3000/api/dev/homework-completion-notifications", {
      method: "POST",
      headers: { authorization: "Bearer test-credential", "content-type": "application/json" },
      body: JSON.stringify({ notificationId: config.notificationId }),
    });
    expect((await POST(localhostRequest)).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledOnce();
  });
});
