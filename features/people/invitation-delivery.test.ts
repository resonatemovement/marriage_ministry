import { describe, expect, it } from "vitest";

import { deliveryCategory } from "./invitation-delivery-model";

describe("activation delivery error mapping", () => {
  it("maps provider failures without exposing raw messages", () => {
    expect(deliveryCategory("Email rate limit exceeded")).toBe("rate_limited");
    expect(deliveryCategory("User already registered")).toBe("user_exists");
    expect(deliveryCategory("Redirect URL is not allowed")).toBe("redirect_configuration");
  });
});
