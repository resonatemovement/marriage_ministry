import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createSupabaseServerClient, getClaims } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
}));

vi.mock("@/lib/supabase/server-client", () => ({
  createSupabaseServerClient,
}));

import { KEEP_ALIVE_CRON_PATH, bypassesSessionProxy, proxy } from "./proxy";

function request(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

describe("proxy cron routing", () => {
  it("bypasses only the CRON_SECRET-protected keep-alive route without a redirect", async () => {
    const response = await proxy(request(KEEP_ALIVE_CRON_PATH));

    expect(bypassesSessionProxy(KEEP_ALIVE_CRON_PATH)).toBe(true);
    expect(bypassesSessionProxy(`${KEEP_ALIVE_CRON_PATH}/extra`)).toBe(false);
    expect(bypassesSessionProxy("/api/cron/other")).toBe(false);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(response.status).not.toBe(307);
  });

  it("keeps normal session processing for unrelated routes", async () => {
    createSupabaseServerClient.mockReturnValue({ auth: { getClaims } });

    await proxy(request("/people"));

    expect(createSupabaseServerClient).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledOnce();
  });

  it.each([
    "/onboarding/photo-handoff/synthetic-token",
    "/api/onboarding/photo-handoff/synthetic-token",
  ])("prevents caching and referrer leakage for handoff routes (%s)", async (path) => {
    createSupabaseServerClient.mockReturnValue({ auth: { getClaims } });

    const response = await proxy(request(path));

    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
