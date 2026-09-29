import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "features/resource-library/resource-upload-sheet.tsx"), "utf8");

describe("Resource upload submit button loading state", () => {
  it("keeps the normal Upload Resource label and uses one generic disabled label in every active phase", () => {
    expect(source).toContain('busy ? "Uploading..." : replacement ? "Replace file" : "Upload Resource"');
    expect(source).toContain('disabled={busy || !file || Boolean(error)}');
    expect(source).toContain('const busy = stage !== "idle";');
    expect(source).toContain('type Stage = "idle" | "preparing" | "uploading" | "finalizing";');
  });

  it.each([
    ["preparing", "Preparing upload..."],
    ["uploading", "Uploading directly to secure storage..."],
    ["finalizing", "Finalizing Resource..."],
  ])("shows phase detail separately during %s", (stage, detail) => {
    expect(source).toContain(`stage === "${stage}"`);
    expect(source).toContain(detail);
    expect(source).toContain('<p role="status" className="text-sm font-medium text-brand-primary">{stageLabel}</p>');
    expect(source).not.toContain(`busy ? stageLabel :`);
  });
});
