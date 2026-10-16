import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("features/settings/campus-settings.tsx", "utf8");
const actions = readFileSync("features/settings/campus-actions.ts", "utf8");

describe("Campus Settings toast feedback", () => {
  it("shows shared feedback after successful campus mutations and refreshes without a full reload", () => {
    expect(component).toContain('showSuccessToast("Settings saved successfully.")');
    expect(component.match(/showSuccessToast\(/g)).toHaveLength(2);
    expect(component).toContain('showErrorToast("Unable to save settings. Please try again.")');
    expect(component).toContain("router.refresh()");
    expect(component).not.toContain("window.location.reload()");
  });

  it("keeps campus validation inline and reports query or persistence errors safely", () => {
    expect(actions).toContain("validation?: true");
    expect(actions).toContain("validationError(");
    expect(actions).toContain("if (duplicateCheck.failed) return saveError()");
    expect(component).toContain("if (result.validation) setError(result.error)");
    expect(component).toContain('role="alert"');
    expect(component).toContain("pendingRef.current");
  });
});
