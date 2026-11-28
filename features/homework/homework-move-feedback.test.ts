import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const builder = readFileSync(join(process.cwd(), "features/homework/homework-builder-content.tsx"), "utf8");
const dialog = readFileSync(join(process.cwd(), "features/session-builder/move-to-session-dialog.tsx"), "utf8");
const feedback = readFileSync(join(process.cwd(), "features/session-builder/move-notification.ts"), "utf8");

describe("Homework move feedback wiring", () => {
  it("keeps same-Session moves local and offers destination selection with focused reveal", () => {
    expect(builder).toContain("homeworkEditor.moveBlockToPage(blockKey, destinationPageId)");
    expect(builder).toContain('"View Page"');
    expect(builder).toContain("homeworkEditor.selectPage(destinationPageId)");
    expect(builder).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(builder).toContain("scrollIntoView({ behavior: reduceMotion ? \"auto\" : \"smooth\", block: \"center\" })");
    expect(builder).toContain("setHighlightedBlockKey(null), 2200");
    expect(feedback).toContain("This draft change is not saved yet");
    expect(builder).toContain("motion-reduce:transition-none");
  });

  it("announces a cross-Session success only after confirmed server success and blocks duplicate submits", () => {
    expect(dialog).toContain("moveStarted.current || success");
    expect(dialog.indexOf("if (!result.ok)")).toBeLessThan(dialog.indexOf("showSuccessToastWithAction("));
    expect(dialog).toContain('"Open Session"');
    expect(dialog).toContain("setError(result.error)");
    expect(dialog).toContain("showErrorToast(result.error)");
    expect(dialog).toContain("router.push(feedback.destinationHref)");
  });
});
