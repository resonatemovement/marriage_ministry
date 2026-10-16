import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const builder = readFileSync(join(process.cwd(), "features/homework/homework-builder-content.tsx"), "utf8");
const sessionEditor = readFileSync(join(process.cwd(), "features/session-builder/session-editor.tsx"), "utf8");

describe("Homework Builder feedback", () => {
  it("keeps block authoring staged locally and routes persistence through Session Builder save actions", () => {
    expect(builder).toContain("homeworkEditor.addBlock(type)");
    expect(builder).toContain("homeworkEditor.deleteBlock(deleteTarget, deleteConfirmation)");
    expect(builder).not.toMatch(/toast\.(success|error)\(/);
    expect(sessionEditor).toContain('homeworkDirty ? "Homework saved successfully."');
    expect(sessionEditor).toContain('intent === "publish_changes" ? "Homework published successfully."');
  });

  it("keeps retryable load errors inline without stacking a toast", () => {
    expect(builder).toContain('role="alert"');
    expect(builder).toContain('>Try again</button>');
    expect(builder).not.toContain("sonner");
  });
});
