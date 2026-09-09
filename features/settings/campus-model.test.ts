import { describe, expect, it } from "vitest";

import { canDisplayCampus, isSelectableCampus, normalizeCampusName } from "./campus-model";

describe("campus lookup behavior", () => {
  it("normalizes names and rejects blank values", () => {
    expect(normalizeCampusName("  North Campus  ")).toBe("North Campus");
    expect(normalizeCampusName("   ")).toBe("");
  });

  it("only active campuses are selectable", () => {
    expect(isSelectableCampus({ active: true })).toBe(true);
    expect(isSelectableCampus({ active: false })).toBe(false);
  });

  it("keeps an inactive current campus displayable without making it selectable elsewhere", () => {
    expect(canDisplayCampus({ active: false }, "campus-1", "campus-1")).toBe(true);
    expect(canDisplayCampus({ active: false }, "campus-1", "campus-2")).toBe(false);
  });
});
