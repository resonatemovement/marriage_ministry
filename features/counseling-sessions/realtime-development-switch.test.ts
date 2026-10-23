import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startFeatureRealtimeSubscription } from "./auth-ready-realtime";

const featureComponents = [
  "homework-progress-realtime.tsx",
  "meeting-realtime.tsx",
  "case-lifecycle-realtime.tsx",
  "meeting-notification-realtime.tsx",
];

describe("development Realtime subscription switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps Realtime enabled by default when the switch is absent", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_DISABLE_REALTIME_SUBSCRIPTIONS", undefined);
    const setup = vi.fn(() => vi.fn());

    const cleanup = startFeatureRealtimeSubscription(setup);

    expect(setup).toHaveBeenCalledOnce();
    expect(cleanup).toBe(setup.mock.results[0].value);
  });

  it("disables feature setup only for the exact development value true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_DISABLE_REALTIME_SUBSCRIPTIONS", "true");
    const setup = vi.fn(() => vi.fn());

    expect(startFeatureRealtimeSubscription(setup)).toBeUndefined();
    expect(setup).not.toHaveBeenCalled();
  });

  it.each(["false", "TRUE", "1"])("keeps Realtime enabled for development value %s", (value) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEV_DISABLE_REALTIME_SUBSCRIPTIONS", value);
    const setup = vi.fn(() => vi.fn());

    startFeatureRealtimeSubscription(setup);

    expect(setup).toHaveBeenCalledOnce();
  });

  it("ignores the development switch in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DEV_DISABLE_REALTIME_SUBSCRIPTIONS", "true");
    const setup = vi.fn(() => vi.fn());

    startFeatureRealtimeSubscription(setup);

    expect(setup).toHaveBeenCalledOnce();
  });

  it.each(featureComponents)("gates %s before client/auth/channel setup without conditional hooks", (file) => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

    expect(source).toContain("useEffect(() => {");
    expect(source).toContain("return startFeatureRealtimeSubscription(() => {");
    expect(source.indexOf("return startFeatureRealtimeSubscription(() => {"))
      .toBeLessThan(source.indexOf("createBrowserSupabaseClient()"));
    expect(source).toContain("startAuthReadyRealtimeSubscription({");
    expect(source).toContain("return null;");
    expect(source).not.toMatch(/if\s*\([^)]*areFeatureRealtimeSubscriptionsEnabled[^)]*\)\s*return\s+useEffect/);
  });
});
