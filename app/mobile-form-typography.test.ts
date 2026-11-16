import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const viewport = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

describe("mobile editable form typography", () => {
  it("sets a 16px minimum for shared and native text-entry controls on touch-primary devices", () => {
    expect(globalStyles).toContain("@media (pointer: coarse)");
    expect(globalStyles).toContain('input[type="password"]');
    expect(globalStyles).toContain('input[type="date"]');
    expect(globalStyles).toContain("textarea");
    expect(globalStyles).toContain("select");
    expect(globalStyles).toContain('[role="combobox"]');
    expect(globalStyles).toContain('[role="searchbox"]');
    expect(globalStyles).toContain('[role="textbox"]');
    expect(globalStyles).toContain('[contenteditable="true"]');
    expect(globalStyles).toContain("font-size: 16px");
  });

  it("preserves desktop typography and explicitly larger control typography", () => {
    expect(globalStyles).not.toMatch(/@media[^{}]*\(min-width:/);
    for (const size of ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl", "text-7xl", "text-8xl", "text-9xl"]) {
      expect(globalStyles).toContain(`:not(.${size})`);
    }
  });

  it("does not disable intentional browser zoom", () => {
    expect(viewport).not.toMatch(/userScalable\s*:\s*false|maximumScale\s*:\s*1/);
    expect(globalStyles).not.toMatch(/touch-action\s*:\s*none|gesture(start|change|end)/i);
  });
});
