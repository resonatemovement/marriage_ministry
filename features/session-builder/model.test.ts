import { describe, expect, it } from "vitest";

import { isSessionLifecycleAction, isSessionStatus, normalizeSessionTitle, sessionLifecycleTarget, sessionStatusLabel } from "./model";

describe("Session Builder lifecycle", () => {
  it("recognizes supported statuses and labels", () => {
    expect(isSessionStatus("draft")).toBe(true);
    expect(isSessionStatus("invalid")).toBe(false);
    expect(isSessionLifecycleAction("archive")).toBe(true);
    expect(isSessionLifecycleAction("invalid")).toBe(false);
    expect(sessionStatusLabel("published")).toBe("Published");
  });

  it("normalizes a title before saving", () => {
    expect(normalizeSessionTitle("  Session one  ")).toBe("Session one");
  });

  it("allows only archive and restore lifecycle transitions", () => {
    expect(sessionLifecycleTarget("draft", "archive")).toBe("archived");
    expect(sessionLifecycleTarget("published", "archive")).toBe("archived");
    expect(sessionLifecycleTarget("archived", "restore")).toBe("draft");
    expect(sessionLifecycleTarget("draft", "restore")).toBeNull();
  });
});
