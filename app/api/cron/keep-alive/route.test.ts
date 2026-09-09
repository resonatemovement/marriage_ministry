import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { GET } from "./route";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/keep-alive", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("GET /api/cron/keep-alive", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dev.example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
    process.env.SUPABASE_SECRET_KEY = "secret-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  it("returns 401 for missing or invalid cron authorization", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong-secret"))).status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("upserts the heartbeat only after valid cron authorization", async () => {
    const single = vi.fn().mockResolvedValue({ data: { last_seen_at: "2026-08-25T12:00:00.000Z" }, error: null });
    const upsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    createClient.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert }) });

    const response = await GET(request("Bearer test-cron-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, lastSeenAt: "2026-08-25T12:00:00.000Z" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "vercel-keep-alive", last_seen_at: expect.any(String) }),
      { onConflict: "name" },
    );
  });

  it("returns a safe server error when the heartbeat write fails", async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    createClient.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) }) });

    const response = await GET(request("Bearer test-cron-secret"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Keep-alive failed" });
  });
});
