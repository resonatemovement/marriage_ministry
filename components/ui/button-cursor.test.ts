import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync("app/globals.css", "utf8");
const lifecycleControls = readFileSync("features/counseling-sessions/session-lifecycle-controls.tsx", "utf8");

describe("project button cursor convention", () => {
  it("uses a pointer for enabled buttons and a not-allowed cursor for disabled buttons", () => {
    expect(globalStyles).toMatch(/button:not\(:disabled\)[\s\S]*?\{\s*cursor:\s*pointer;/);
    expect(globalStyles).toMatch(/button:disabled[\s\S]*?\{\s*cursor:\s*not-allowed;/);
  });

  it("keeps lifecycle button styling and disabled semantics aligned with the cursor convention", () => {
    expect(lifecycleControls).toContain('meeting ? "Schedule Next Session" : "Schedule Initial Meeting"');
    expect(lifecycleControls).toContain("<button disabled={pending || ((open === \"complete-initial\" || open === \"complete-session\") && !sessionId)");
    const buttonTags = lifecycleControls.match(/<button\b[^>]*>/g) ?? [];
    expect(buttonTags.length).toBeGreaterThan(1);
    expect(lifecycleControls).toContain("cursor-pointer disabled:cursor-not-allowed");
    expect(lifecycleControls).toContain("bg-brand-primary px-4 text-sm font-bold text-white");
  });
});
