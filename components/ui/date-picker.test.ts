import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { formatDateInput, parseDateInput } from "./date-picker";

const source = readFileSync("components/ui/date-picker.tsx", "utf8");

describe("shared shadCN DatePicker", () => {
  it("renders selected dates in MM/DD/YYYY format", () => {
    expect(formatDateInput("2026-10-14")).toBe("10/14/2026");
  });

  it("accepts a valid keyboard-entered date", () => {
    expect(parseDateInput("10/14/2026")).toEqual({ date: "2026-10-14", error: null });
  });

  it("returns an inline validation error for incomplete or invalid date text", () => {
    expect(parseDateInput("10/14/").error).toBe("Enter a date in MM/DD/YYYY format.");
    expect(parseDateInput("02/30/2026").error).toBe("Enter a valid calendar date.");
  });

  it("connects keyboard entry and calendar selection to the same displayed text state", () => {
    expect(source).toContain('placeholder="MM/DD/YYYY"');
    expect(source).toContain("onChange(parsed.date)");
    expect(source).toContain("onSelect={selectDate}");
    expect(source).toContain("setInputValue(formatDateInput(nextValue))");
    expect(source).toContain('type="text"');
    expect(source).toContain('aria-label={`Open ${label} calendar`}');
  });

  it("uses the shared inline form error treatment for invalid and required dates", () => {
    expect(source).toContain('"Meeting date is required."');
    expect(source).toContain('role="alert" className="text-sm text-danger-strong"');
    expect(source).toContain("aria-describedby={error ? errorId : undefined}");
  });

  it("supports an optional calendar minimum date without changing unrelated date pickers", () => {
    expect(source).toContain("minDate?: string");
    expect(source).toContain("disabled={minimumDate ? { before: minimumDate } : undefined}");
    expect(source).toContain("defaultMonth={calendarMonth}");
    expect(source).toContain("(touched || externalError ? inputError : null)");
  });

  it("uses a subtle accessible focus border without a blue outline or ring", () => {
    expect(source).toContain("focus-visible:outline-none focus-visible:border-brand-secondary");
    expect(source).not.toContain("focus-visible:ring");
    expect(source).not.toContain("focus-visible:outline-2");
    expect(source).not.toContain("focus-visible:text-brand-primary");
  });
});
