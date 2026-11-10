import { describe, expect, it } from "vitest";

import { buildPhotoHandoffUrl } from "./photo-handoff-url";

describe("buildPhotoHandoffUrl", () => {
  it.each([
    "https://marriage-ministry-dev.vercel.app/login",
    "https://marriage-ministry-dev.vercel.app/workspace/onboarding/profile",
  ])("roots the handoff route at the application origin when the base has a path", (baseUrl) => {
    const url = new URL(buildPhotoHandoffUrl(baseUrl, "test-token-placeholder"));

    expect(url.origin).toBe("https://marriage-ministry-dev.vercel.app");
    expect(url.pathname).toBe("/onboarding/photo-handoff/test-token-placeholder");
  });

  it("keeps the path rooted when the base is already an origin", () => {
    const url = new URL(buildPhotoHandoffUrl("https://marriage-ministry-dev.vercel.app", "test-token-placeholder"));

    expect(url.pathname).toBe("/onboarding/photo-handoff/test-token-placeholder");
  });
});
