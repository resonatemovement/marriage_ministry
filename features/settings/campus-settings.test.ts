import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("features/settings/campus-settings.tsx", "utf8");
const actions = readFileSync("features/settings/campus-actions.ts", "utf8");
const sharedSwitch = readFileSync("components/ui/switch.tsx", "utf8");

describe("Admin Campus Settings feedback", () => {
  it("uses one shared success/error toast for confirmed existing campus mutations", () => {
    expect(component).toContain('showSuccessToast("Settings saved successfully.")');
    expect(component.match(/showSuccessToast\(/g)).toHaveLength(2);
    expect(component).toContain('showErrorToast("Unable to save settings. Please try again.")');
    expect(component).toContain("router.refresh()");
    expect(component).not.toContain("window.location.reload()");
  });

  it("keeps campus validation inline and distinguishes it from operation failures", () => {
    expect(actions).toContain("validation?: true");
    expect(actions).toContain("validationError(");
    expect(component).toContain("if (result.validation) setError(result.error)");
    expect(component).toContain('role="alert"');
    expect(component).toContain("disabled={pending}");
  });

  it("renders the shared Switch from persisted campus state and keeps row actions aligned", () => {
    expect(component).toContain('import { Switch } from "@/components/ui/switch"');
    expect(component).toContain("<Switch checked={campus.active}");
    expect(component).toContain('aria-label={`${campus.active ? "Deactivate" : "Activate"} ${campus.name}`}');
    expect(component).toContain("<Switch checked={campus.active} onCheckedChange={() => toggle(campus)} disabled={pending}");
    expect(component).toContain('className="flex items-center gap-2"');
    expect(component).not.toContain("setCampuses");
  });

  it("preserves the existing individual update action, disables rapid repeat actions, and inherits Radix keyboard support", () => {
    expect(component).toContain('formData.set("active", String(!campus.active))');
    expect(component).toContain("await setCampusActive(formData)");
    expect(component).toContain("if (pending || pendingRef.current) return");
    expect(component).toContain("disabled={pending}");
    expect(component).toContain("showSuccessToast(\"Settings saved successfully.\")");
    expect(component).toContain("showErrorToast(\"Unable to save settings. Please try again.\")");
    expect(component).not.toContain("AlertDialog");
    expect(sharedSwitch).toContain('import { Switch as SwitchPrimitive } from "radix-ui"');
    expect(sharedSwitch).toContain("{...props}");
  });
});
