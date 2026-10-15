import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dropdownMenu = readFileSync("components/ui/dropdown-menu.tsx", "utf8");
const lifecycleControls = readFileSync("features/counseling-sessions/session-lifecycle-controls.tsx", "utf8");

describe("shared DropdownMenuItem interaction styling", () => {
  it("gives enabled items pointer, neutral hover, and Radix keyboard highlight states", () => {
    expect(dropdownMenu).toContain("cursor-pointer");
    expect(dropdownMenu).toContain("hover:bg-surface-muted");
    expect(dropdownMenu).toContain("data-[highlighted]:bg-surface-muted");
    expect(dropdownMenu).toContain("focus-visible:bg-surface-muted");
    expect(dropdownMenu).toContain("rounded-md px-2");
  });

  it("keeps destructive text and uses the subtle destructive hover/focus surface", () => {
    expect(dropdownMenu).toContain("data-[variant=destructive]:text-danger-strong");
    expect(dropdownMenu).toContain("data-[variant=destructive]:hover:bg-danger-soft");
    expect(dropdownMenu).toContain("data-[variant=destructive]:data-[highlighted]:bg-danger-soft");
    expect(dropdownMenu).toContain("data-[variant=destructive]:focus-visible:bg-danger-soft");
  });

  it("keeps disabled items non-pointer and removes their interactive hover/highlight surface", () => {
    expect(dropdownMenu).toContain("data-[disabled]:cursor-not-allowed");
    expect(dropdownMenu).toContain("data-[disabled]:hover:bg-transparent");
    expect(dropdownMenu).toContain("data-[disabled]:focus:bg-transparent");
    expect(dropdownMenu).toContain("data-[disabled]:data-[highlighted]:bg-transparent");
    expect(dropdownMenu).toContain("data-[disabled]:data-[variant=destructive]:hover:bg-transparent");
    expect(dropdownMenu).toContain("data-[disabled]:data-[variant=destructive]:focus-visible:bg-transparent");
  });

  it("leaves labels and separators without item interaction styling", () => {
    const label = dropdownMenu.slice(dropdownMenu.indexOf("function DropdownMenuLabel"), dropdownMenu.indexOf("function DropdownMenuSeparator"));
    const separator = dropdownMenu.slice(dropdownMenu.indexOf("function DropdownMenuSeparator"), dropdownMenu.indexOf("export {"));
    expect(label).not.toContain("cursor-pointer");
    expect(label).not.toContain("hover:bg-");
    expect(separator).not.toContain("cursor-pointer");
    expect(separator).not.toContain("hover:bg-");
  });

  it("preserves the existing Next Step action items, order, and destructive variant", () => {
    const menu = lifecycleControls.slice(lifecycleControls.indexOf("<DropdownMenuContent"), lifecycleControls.indexOf("</DropdownMenuContent>"));
    const rescheduleIndex = menu.indexOf("Reschedule Meeting");
    const followupIndex = menu.indexOf("Schedule Follow-up Meeting");
    const resendIndex = menu.indexOf("MeetingNotificationResendMenuItems");
    const closeIndex = menu.indexOf("Close Counseling Case");
    expect(rescheduleIndex).toBeGreaterThan(-1);
    expect(followupIndex).toBeGreaterThan(rescheduleIndex);
    expect(resendIndex).toBeGreaterThan(followupIndex);
    expect(closeIndex).toBeGreaterThan(resendIndex);
    expect(lifecycleControls).toContain('variant="destructive"');
  });

  it("gives both enabled Next Step split-button controls direct and disabled cursor states", () => {
    const mainAction = lifecycleControls.match(/<button type="button" onClick=\{\(\) => openMode\(primaryMode\)\} className=\{`([^`]+)`\}/);
    const arrowTrigger = lifecycleControls.match(/aria-label="More counseling actions" className="([^"]+)"/);
    expect(mainAction?.[1]).toContain("cursor-pointer");
    expect(mainAction?.[1]).toContain("disabled:cursor-not-allowed");
    expect(arrowTrigger?.[1]).toContain("cursor-pointer");
    expect(arrowTrigger?.[1]).toContain("disabled:cursor-not-allowed");
  });

  it("does not alter the Next Step primary action or secondary-action structure", () => {
    expect(lifecycleControls).toContain('"Schedule Next Session"');
    expect(lifecycleControls).toContain("<DropdownMenuTrigger asChild>");
    expect(lifecycleControls).toContain("<DropdownMenuContent align=\"end\"");
    expect(lifecycleControls).toContain("Reschedule Meeting");
    expect(lifecycleControls).toContain("Schedule Follow-up Meeting");
    expect(lifecycleControls).toContain("MeetingNotificationResendMenuItems");
    expect(lifecycleControls).toContain('variant="destructive"');
    expect(lifecycleControls).toContain("Close Counseling Case");
  });
});
