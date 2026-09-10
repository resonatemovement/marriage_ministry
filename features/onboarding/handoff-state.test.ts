import { describe, expect, it } from "vitest";

import { handoffMessage } from "./handoff-state";

describe("photo handoff state", () => {
  it("keeps expired and completed handoffs distinct", () => {
    expect(handoffMessage("expired")).toContain("expired");
    expect(handoffMessage("completed")).toContain("already been completed");
  });

  it("does not describe an invalid handoff as usable", () => {
    expect(handoffMessage("invalid")).toContain("no longer valid");
  });
});
