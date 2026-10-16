import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const library = readFileSync(join(process.cwd(), "features/resource-library/resource-library.tsx"), "utf8");
const upload = readFileSync(join(process.cwd(), "features/resource-library/resource-upload-sheet.tsx"), "utf8");
const detail = readFileSync(join(process.cwd(), "features/resource-library/resource-detail-sheet.tsx"), "utf8");

describe("Resource Library mutation feedback", () => {
  it("uses shared toasts for upload, replacement, metadata, archive, restore, and deletion outcomes", () => {
    expect(library).toContain('showSuccessToast(wasReplacement ? "Resource file replaced successfully." : "Resource uploaded successfully.")');
    expect(upload).toContain('showErrorToast("Unable to upload Resource. Please try again.")');
    expect(detail).toContain('showSuccessToast("Resource deleted successfully.")');
    expect(detail).toContain('"Resource archived successfully." : "Resource restored successfully."');
    expect(detail).toContain('showSuccessToast("Resource details saved successfully.")');
    expect(detail).toContain('showErrorToast("Unable to save Resource details. Please try again.")');
    expect(detail).toContain('showErrorToast(action === "delete"');
  });

  it("keeps local upload validation, entered values, pending protection, and partial-success warnings", () => {
    expect(upload).toContain('setError("Choose a file to upload.")');
    expect(upload).toContain('setError("This file type is not supported.")');
    expect(upload).toContain("setStage(\"idle\")");
    expect(upload).toContain("disabled={busy || !file || Boolean(error)}");
    expect(library).toContain('toast.warning("The file is available, but older file cleanup needs administrator attention.")');
    expect(library).toContain('toast.warning("The upload succeeded, but the library could not refresh.")');
  });

  it("does not expose server error details or duplicate operation errors inline", () => {
    expect(upload).not.toContain("setError(uploadError");
    expect(detail).not.toContain("result.error");
    expect(detail).not.toContain("actionError");
    expect(detail).not.toContain("editError");
  });
});
