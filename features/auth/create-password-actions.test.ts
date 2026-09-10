import { describe, expect, it } from "vitest";

import { passwordError } from "./password-validation";

describe("Create Password validation", () => {
  it("requires a 12-character matching password", () => {
    expect(passwordError("short", "short")).toBe("Use at least 12 characters.");
    expect(passwordError("valid-password", "different-password")).toBe("Passwords do not match.");
    expect(passwordError("valid-password", "valid-password")).toBeNull();
  });
});
