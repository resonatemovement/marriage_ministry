import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const editor = readFileSync(join(process.cwd(), "features/session-builder/session-editor.tsx"), "utf8");
const saveAction = readFileSync(join(process.cwd(), "features/session-builder/save-session-state.ts"), "utf8");

describe("Session Builder feedback", () => {
  it("uses shared success and safe operation-error feedback for save and publish outcomes", () => {
    expect(editor).toContain("showSuccessToast(successMessage)");
    expect(editor).toContain("else showErrorToast(result.error)");
    expect(editor).toContain('"Session published successfully."');
    expect(editor).toContain('"Homework published successfully."');
    expect(editor).toContain('"Homework saved successfully."');
    expect(editor).toContain('"Session changes saved successfully."');
    expect(editor).not.toMatch(/toast\.(success|error)\(/);
  });

  it("keeps known authoring validation inline and classifies unexpected failures for one toast", () => {
    expect(saveAction).toContain('errorKind: "validation"');
    expect(saveAction).toContain('errorKind: "operation"');
    expect(editor).toContain('if (result.errorKind === "validation") setPublishActionError(result.error)');
    expect(editor).toContain("setPublishActionError(validation)");
  });

  it("preserves pending protection and first-save navigation after confirmed success", () => {
    expect(editor).toContain("if (pendingRef.current || archived) return;");
    expect(editor).toContain("pendingRef.current = true;");
    expect(editor).toContain("pendingRef.current = false;");
    expect(editor).toContain("router.replace(`/session-builder/${next.sessionId}`)");
  });
});
