import { describe, expect, it } from "vitest";

import { activationUrl, isRecoveryActivation } from "./activation-link";

describe("activation links", () => {
  it("uses the application route and only carries the one-time token hash", () => {
    const url = new URL(activationUrl("http://localhost:3000", "one-time-hash"));
    expect(url.pathname).toBe("/auth/activate");
    expect(url.searchParams.get("token_hash")).toBe("one-time-hash");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.searchParams.has("refresh_token")).toBe(false);
  });

  it("requires a recovery token hash", () => {
    expect(isRecoveryActivation("hash", "recovery")).toBe(true);
    expect(isRecoveryActivation(null, "recovery")).toBe(false);
    expect(isRecoveryActivation("hash", "invite")).toBe(false);
  });
});
