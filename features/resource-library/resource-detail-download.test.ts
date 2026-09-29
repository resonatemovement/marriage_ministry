import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "features/resource-library/resource-detail-sheet.tsx"), "utf8");

describe("Resource detail download control", () => {
  it("uses one same-origin navigation with a disabled pending label and no intermediate link", () => {
    expect(source).toContain('window.location.assign(`/resource-library/${encodeURIComponent(item.id)}/download`)');
    expect(source).toContain('disabled={downloading}');
    expect(source).toContain('{downloading ? "Downloading..." : "Download"}');
    expect(source).not.toContain("Download file");
    expect(source).not.toContain("downloadUrl");
  });

  it("keeps Open as an independent preview action", () => {
    expect(source).toContain('<a href={activeDetail.previewUrl} target="_blank"');
    expect(source).toContain(">Open</a>");
  });
});
