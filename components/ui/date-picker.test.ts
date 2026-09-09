import { describe, expect, it } from "vitest";

import { formatDateLabel, formatDateOnly, parseDateOnly } from "./date-picker";

describe("date-only picker helpers", () => {
  it("round-trips date-only values in local calendar parts", () => {
    const date = parseDateOnly("2026-09-09");
    expect(date).toBeDefined();
    expect(formatDateOnly(date!)).toBe("2026-09-09");
    expect(formatDateLabel("2026-09-09")).toBe("Sep 9, 2026");
  });

  it("rejects malformed and impossible calendar dates", () => {
    expect(parseDateOnly("0002-12-26")).toBeUndefined();
    expect(parseDateOnly("2026-02-30")).toBeUndefined();
    expect(parseDateOnly("Sep 9, 2026")).toBeUndefined();
  });
});
